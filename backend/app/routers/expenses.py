import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.activity import log_activity
from app.auth import get_current_user, get_db
from app.models import Expense, ExpenseSplit, Group, Membership, RecurringRule, User
from app.routers.groups import get_group_member
from app.schemas import DebtOut, ExpenseCreate, ExpenseOut, SplitOut
from app.services.balances import group_debts
from app.services.money import convert, split_minor, split_weighted
from app.services.rates import get_rate

router = APIRouter(prefix="/api", tags=["expenses"])


def expense_out(e: Expense, splits: list[tuple[int, int]]) -> ExpenseOut:
    """splits: [(user_id, amount_minor)]"""
    return ExpenseOut(
        id=e.id,
        group_id=e.group_id,
        created_by=e.created_by,
        payer_id=e.payer_id,
        description=e.description,
        amount_minor=e.amount_minor,
        currency=e.currency,
        converted_amount_minor=e.converted_amount_minor,
        rate=e.rate,
        date=e.date,
        category=e.category,
        splits=[SplitOut(user_id=u, amount_minor=a) for u, a in splits],
        recurring_rule_id=e.recurring_rule_id,
        receipt_path=e.receipt_path,
        notes=e.notes,
        created_at=e.created_at,
    )


async def _editable_expense(expense_id: int, user: User, db: AsyncSession) -> Expense:
    """The expense, if `user` is its creator or a group admin. 404 if not a member."""
    expense = await db.get(Expense, expense_id)
    if expense is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    membership = await db.scalar(
        select(Membership).where(
            Membership.group_id == expense.group_id,
            Membership.user_id == user.id,
        )
    )
    if membership is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if expense.created_by != user.id and membership.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only creator or admin can change this")
    return expense


def _whole(values: list, what: str, minimum: int) -> list[int]:
    """Integer minor units >= minimum; 422 on missing/fractional/too small (never truncate)."""
    if any(v is None or v != int(v) or v < minimum for v in values):
        raise HTTPException(422, f"{what} must be whole numbers of at least {minimum} (minor units)")
    return [int(v) for v in values]


def _split_amounts(converted: int, splits) -> list[int]:
    """Per-split minor amounts for one mode. Values are validated before any
    arithmetic so bad input is a 422, never a 500."""
    modes = {s.mode for s in splits}
    values = [s.value for s in splits]
    if modes == {"equal"}:
        return split_minor(converted, len(splits))
    if modes == {"amounts"}:
        vals = _whole(values, "Split amounts", 1)
        if sum(vals) != converted:
            raise HTTPException(422, "Split amounts must sum to the expense total")
        return vals
    if modes == {"percent"}:
        if any(v is None or not 0 < v <= 100 for v in values):
            raise HTTPException(422, "Each percentage must be greater than 0 and at most 100")
        if round(sum(values), 6) != 100:
            raise HTTPException(422, "Percent splits must sum to 100")
        return split_weighted(converted, [int(round(p * 100)) for p in values])
    if modes == {"shares"}:
        return split_weighted(converted, _whole(values, "Shares", 1))
    if modes == {"itemized"}:
        # each value is that person's own items; whatever's left of the total
        # (tax, tip, delivery…) is shared equally across everyone in the split
        items = _whole(values, "Item amounts", 0)
        extras = converted - sum(items)
        if extras < 0:
            raise HTTPException(422, "Item amounts add up to more than the expense total")
        return [item + share for item, share in zip(items, split_minor(extras, len(items)))]
    raise HTTPException(422, "All splits must use the same mode")


@router.post("/groups/{group_id}/expenses", response_model=ExpenseOut)
async def create_expense(
    group_id: int,
    payload: ExpenseCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    pair: tuple = Depends(get_group_member),
):
    group, _ = pair
    ids = [s.user_id for s in payload.splits]
    if len(set(ids)) != len(ids):
        raise HTTPException(422, "Duplicate split users")

    member_ids = set(
        await db.scalars(
            select(Membership.user_id).where(Membership.group_id == group.id)
        )
    )
    if payload.payer_id not in member_ids:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payer is not a member")
    missing = [uid for uid in ids if uid not in member_ids]
    if missing:
        raise HTTPException(422, "Split users must be group members")

    currency = payload.currency.upper()
    rate = None
    converted = payload.amount_minor
    if currency != group.currency:
        rate = await get_rate(db, currency, group.currency)
        converted = convert(payload.amount_minor, rate)

    amounts = _split_amounts(converted, payload.splits)
    expense = Expense(
        group_id=group.id,
        created_by=user.id,
        payer_id=payload.payer_id,
        description=payload.description,
        amount_minor=payload.amount_minor,
        currency=currency,
        converted_amount_minor=converted if rate else None,
        rate=rate,
        date=payload.date or dt.date.today(),
        category=payload.category,
        notes=payload.notes,
    )
    db.add(expense)
    await db.flush()
    for s, amt in zip(payload.splits, amounts):
        db.add(ExpenseSplit(expense_id=expense.id, user_id=s.user_id, amount_minor=amt))
    if payload.recurring:
        from app.services.recurring import advance

        rule = RecurringRule(
            group_id=group.id,
            freq=payload.recurring.freq,
            day=payload.recurring.day,
            next_run=advance(payload.recurring.freq, payload.recurring.day, expense.date),
        )
        db.add(rule)
        await db.flush()
        expense.recurring_rule_id = rule.id
    await log_activity(db, group.id, user.id, "expense_added", target_id=expense.id)
    await db.commit()
    await db.refresh(expense)
    return expense_out(expense, [(sp.user_id, a) for sp, a in zip(payload.splits, amounts)])


@router.get("/groups/{group_id}/expenses", response_model=list[ExpenseOut])
async def list_expenses(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    pair: tuple = Depends(get_group_member),
):
    group, _ = pair
    expenses = (
        await db.scalars(
            select(Expense)
            .where(Expense.group_id == group.id, Expense.deleted_at.is_(None))
            .order_by(Expense.date.desc(), Expense.id.desc())
        )
    ).all()
    splits: dict[int, list[tuple[int, int]]] = {}
    rows = await db.scalars(
        select(ExpenseSplit)
        .where(ExpenseSplit.expense_id.in_([e.id for e in expenses]))
        .order_by(ExpenseSplit.id)
    )
    for sp in rows:
        splits.setdefault(sp.expense_id, []).append((sp.user_id, sp.amount_minor))
    return [expense_out(e, splits.get(e.id, [])) for e in expenses]


@router.get("/groups/{group_id}/debts", response_model=list[DebtOut])
async def get_debts(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    pair: tuple = Depends(get_group_member),
):
    group, _ = pair
    return [
        DebtOut(from_user=f, to_user=t, amount_minor=a) for f, t, a in await group_debts(db, group)
    ]


@router.patch("/expenses/{expense_id}", response_model=ExpenseOut)
async def edit_expense(
    expense_id: int,
    payload: ExpenseCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    expense = await _editable_expense(expense_id, user, db)
    if expense.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    group = await db.get(Group, expense.group_id)

    ids = [s.user_id for s in payload.splits]
    if len(set(ids)) != len(ids):
        raise HTTPException(422, "Duplicate split users")
    member_ids = set(
        await db.scalars(
            select(Membership.user_id).where(Membership.group_id == expense.group_id)
        )
    )
    if payload.payer_id not in member_ids:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payer is not a member")
    missing = [uid for uid in ids if uid not in member_ids]
    if missing:
        raise HTTPException(422, "Split users must be group members")

    currency = payload.currency.upper()
    rate = None
    converted = payload.amount_minor
    if currency != group.currency:
        rate = await get_rate(db, currency, group.currency)
        converted = convert(payload.amount_minor, rate)

    amounts = _split_amounts(converted, payload.splits)
    # ponytail: bulk core delete so child rows go before parent in unit of work
    await db.execute(delete(ExpenseSplit).where(ExpenseSplit.expense_id == expense.id))
    expense.payer_id = payload.payer_id
    expense.description = payload.description
    expense.amount_minor = payload.amount_minor
    expense.currency = currency
    expense.converted_amount_minor = converted if rate else None
    expense.rate = rate
    expense.date = payload.date or expense.date
    expense.category = payload.category
    expense.notes = payload.notes
    for s, amt in zip(payload.splits, amounts):
        db.add(ExpenseSplit(expense_id=expense.id, user_id=s.user_id, amount_minor=amt))
    await log_activity(db, expense.group_id, user.id, "expense_updated", target_id=expense.id)
    await db.commit()
    return expense_out(expense, [(sp.user_id, a) for sp, a in zip(payload.splits, amounts)])


@router.delete("/expenses/{expense_id}")
async def delete_expense(
    expense_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    expense = await _editable_expense(expense_id, user, db)
    if expense.deleted_at is None:
        # soft delete: splits stay so the expense can be restored intact
        expense.deleted_at = dt.datetime.now(dt.UTC).replace(tzinfo=None)
        await log_activity(
            db, expense.group_id, user.id, "expense_deleted", target_id=expense_id
        )
        await db.commit()
    return {"ok": True}


@router.post("/expenses/{expense_id}/restore", response_model=ExpenseOut)
async def restore_expense(
    expense_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    expense = await _editable_expense(expense_id, user, db)
    if expense.deleted_at is not None:
        expense.deleted_at = None
        await log_activity(
            db, expense.group_id, user.id, "expense_restored", target_id=expense_id
        )
        await db.commit()
    splits = await db.scalars(
        select(ExpenseSplit).where(ExpenseSplit.expense_id == expense.id).order_by(ExpenseSplit.id)
    )
    return expense_out(expense, [(sp.user_id, sp.amount_minor) for sp in splits])


@router.delete("/groups/{group_id}/recurring/{rule_id}")
async def cancel_recurring(
    group_id: int,
    rule_id: int,
    me: tuple = Depends(get_group_member),
    db: AsyncSession = Depends(get_db),
):
    group, _ = me
    rule = await db.get(RecurringRule, rule_id)
    if rule is None or rule.group_id != group.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    # ponytail: FK from expenses — clear refs, badge disappears on past rows too
    await db.execute(update(Expense).where(Expense.recurring_rule_id == rule_id).values(recurring_rule_id=None))
    await db.delete(rule)
    await log_activity(db, group.id, _.user_id, "recurring_cancelled", target_id=rule_id)
    await db.commit()
    return {"ok": True}
