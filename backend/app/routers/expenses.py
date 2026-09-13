import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.activity import log_activity
from app.auth import get_current_user, get_db
from app.models import Expense, ExpenseSplit, Group, Membership, RecurringRule, Settlement, User
from app.routers.groups import get_group_member
from app.schemas import DebtOut, ExpenseCreate, ExpenseOut, SplitOut
from app.services.balances import net_balances, simplify_debts
from app.services.money import convert, split_minor, split_weighted
from app.services.rates import get_rate

router = APIRouter(prefix="/api", tags=["expenses"])


def _split_amounts(converted: int, splits) -> list[int]:
    modes = {s.mode for s in splits}
    if modes == {"equal"}:
        return split_minor(converted, len(splits))
    if modes == {"amounts"}:
        vals = [int(s.value) for s in splits]
        if sum(vals) != converted:
            raise HTTPException(422, "Split amounts must sum to the expense total")
        return vals
    if modes == {"percent"}:
        pcts = [s.value for s in splits]
        if round(sum(pcts), 6) != 100:
            raise HTTPException(422, "Percent splits must sum to 100")
        return split_weighted(converted, [int(round(p * 100)) for p in pcts])
    if modes == {"shares"}:
        shares = [s.value for s in splits]
        if any(s is None or s != int(s) or s < 1 for s in shares):
            raise HTTPException(422, "Shares must be positive integers")
        return split_weighted(converted, [int(s) for s in shares])
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
    return ExpenseOut(
        id=expense.id,
        group_id=expense.group_id,
        created_by=expense.created_by,
        payer_id=expense.payer_id,
        description=expense.description,
        amount_minor=expense.amount_minor,
        currency=expense.currency,
        converted_amount_minor=expense.converted_amount_minor,
        rate=expense.rate,
        date=expense.date,
        category=expense.category,
        splits=[SplitOut(user_id=s.user_id, amount_minor=a) for s, a in zip(payload.splits, amounts)],
    )


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
            .where(Expense.group_id == group.id)
            .order_by(Expense.date.desc(), Expense.id.desc())
        )
    ).all()
    out = []
    for e in expenses:
        splits = (
            await db.scalars(
                select(ExpenseSplit).where(ExpenseSplit.expense_id == e.id)
            )
        ).all()
        out.append(
            ExpenseOut(
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
                splits=[SplitOut(user_id=s.user_id, amount_minor=s.amount_minor) for s in splits],
            )
        )
    return out


@router.get("/groups/{group_id}/debts", response_model=list[DebtOut])
async def get_debts(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    pair: tuple = Depends(get_group_member),
):
    group, _ = pair
    expenses = (
        await db.scalars(select(Expense).where(Expense.group_id == group.id))
    ).all()
    exp_rows = []
    for e in expenses:
        total = e.converted_amount_minor if e.converted_amount_minor is not None else e.amount_minor
        splits = (
            await db.scalars(
                select(ExpenseSplit).where(ExpenseSplit.expense_id == e.id)
            )
        ).all()
        exp_rows.append((e.payer_id, total, [(s.user_id, s.amount_minor) for s in splits]))
    settle_rows = (
        await db.execute(
            select(Settlement.payer_id, Settlement.payee_id, Settlement.amount_minor)
            .where(Settlement.group_id == group.id)
        )
    ).all()
    balances = net_balances(exp_rows, settle_rows)
    return [
        DebtOut(from_user=f, to_user=t, amount_minor=a) for f, t, a in simplify_debts(balances)
    ]


@router.patch("/expenses/{expense_id}", response_model=ExpenseOut)
async def edit_expense(
    expense_id: int,
    payload: ExpenseCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    expense = await db.get(Expense, expense_id)
    if expense is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    membership = (
        await db.execute(
            select(Membership).where(
                Membership.group_id == expense.group_id,
                Membership.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if membership is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if expense.created_by != user.id and membership.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only creator or admin can edit")
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
    for s, amt in zip(payload.splits, amounts):
        db.add(ExpenseSplit(expense_id=expense.id, user_id=s.user_id, amount_minor=amt))
    await log_activity(db, expense.group_id, user.id, "expense_updated", target_id=expense.id)
    await db.commit()
    return ExpenseOut(
        id=expense.id,
        group_id=expense.group_id,
        created_by=expense.created_by,
        payer_id=expense.payer_id,
        description=expense.description,
        amount_minor=expense.amount_minor,
        currency=expense.currency,
        converted_amount_minor=expense.converted_amount_minor,
        rate=expense.rate,
        date=expense.date,
        category=expense.category,
        splits=[SplitOut(user_id=s.user_id, amount_minor=a) for s, a in zip(payload.splits, amounts)],
    )


@router.delete("/expenses/{expense_id}")
async def delete_expense(
    expense_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    expense = await db.get(Expense, expense_id)
    if expense is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    membership = (
        await db.execute(
            select(Membership).where(
                Membership.group_id == expense.group_id,
                Membership.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if membership is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if expense.created_by != user.id and membership.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only creator or admin can delete")
    await db.execute(delete(ExpenseSplit).where(ExpenseSplit.expense_id == expense.id))
    await db.delete(expense)
    await log_activity(
        db, expense.group_id, user.id, "expense_deleted", target_id=expense_id
    )
    await db.commit()
    return {"ok": True}
