import csv
import datetime as dt
import io

from fastapi import APIRouter, Depends, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, get_db
from app.models import Activity, Expense, ExpenseSplit, Group, Membership, Settlement, User
from app.routers.groups import get_group_member

router = APIRouter(prefix="/api", tags=["analytics"])


def _cutoff(months: int) -> dt.date:
    """First day of the month `months` back from today."""
    today = dt.date.today()
    y, m = today.year, today.month - months
    while m <= 0:
        m += 12
        y -= 1
    return dt.date(y, m, 1)


def _base_total(e: Expense) -> int:
    return e.converted_amount_minor if e.converted_amount_minor is not None else e.amount_minor


@router.get("/groups/{group_id}/analytics")
async def group_analytics(
    months: int = 6,
    db: AsyncSession = Depends(get_db),
    pair: tuple = Depends(get_group_member),
):
    group, me = pair
    window = _cutoff(max(1, months))
    total = func.coalesce(Expense.converted_amount_minor, Expense.amount_minor)
    in_window = (
        Expense.group_id == group.id,
        Expense.date >= window,
        Expense.deleted_at.is_(None),
    )

    monthly = (
        await db.execute(
            select(func.strftime("%Y-%m", Expense.date), func.sum(total))
            .where(*in_window)
            .group_by(func.strftime("%Y-%m", Expense.date))
            .order_by(func.strftime("%Y-%m", Expense.date))
        )
    ).all()
    by_category = (
        await db.execute(
            select(Expense.category, func.sum(total))
            .where(*in_window)
            .group_by(Expense.category)
            .order_by(func.sum(total).desc())
        )
    ).all()
    you_paid = await db.scalar(
        select(func.coalesce(func.sum(total), 0)).where(*in_window, Expense.payer_id == me.user_id)
    )
    your_share = await db.scalar(
        select(func.coalesce(func.sum(ExpenseSplit.amount_minor), 0))
        .join(Expense, Expense.id == ExpenseSplit.expense_id)
        .where(*in_window, ExpenseSplit.user_id == me.user_id)
    )
    return {
        "monthly": [{"month": m, "total": t} for m, t in monthly],
        "by_category": [{"category": c or "Other", "total": t} for c, t in by_category],
        "summary": {
            "total": sum(t for _, t in monthly),
            "you_paid": you_paid,
            "your_share": your_share,
        },
    }


@router.get("/groups/{group_id}/export.csv")
async def export_csv(
    db: AsyncSession = Depends(get_db),
    pair: tuple = Depends(get_group_member),
):
    group, _ = pair
    rows = (
        await db.execute(
            select(Expense, User.name)
            .join(User, User.id == Expense.payer_id)
            .where(Expense.group_id == group.id, Expense.deleted_at.is_(None))
            .order_by(Expense.date, Expense.id)
        )
    ).all()
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        ["date", "description", "category", "payer", "amount", "currency", "converted"]
    )
    for e, payer_name in rows:
        writer.writerow(
            [
                e.date.isoformat(),
                e.description,
                e.category or "",
                payer_name,
                e.amount_minor,
                e.currency,
                _base_total(e),
            ]
        )
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="group-{group.id}.csv"'},
    )


SETTLEMENT_VERBS = {"settlement_recorded", "settlement_confirmed", "settlement_deleted"}
# verbs whose target_id is an expense ("commented" targets the expense commented on)
EXPENSE_VERBS = {"expense_added", "expense_updated", "expense_deleted", "expense_restored", "commented"}


async def _activity_out(db: AsyncSession, rows: list[Activity]) -> list[dict]:
    """Activity rows with actor + group names and, for expenses/settlements, what it was."""
    expense_ids = {a.target_id for a in rows if a.verb in EXPENSE_VERBS and a.target_id}
    settlement_ids = {a.target_id for a in rows if a.verb in SETTLEMENT_VERBS and a.target_id}
    expenses = {
        e.id: e
        for e in (await db.scalars(select(Expense).where(Expense.id.in_(expense_ids)))).all()
    }
    settlements = {
        s.id: s
        for s in (
            await db.scalars(select(Settlement).where(Settlement.id.in_(settlement_ids)))
        ).all()
    }
    user_ids = {a.user_id for a in rows} | {
        uid for s in settlements.values() for uid in (s.payer_id, s.payee_id)
    }
    names = dict(
        (await db.execute(select(User.id, User.name).where(User.id.in_(user_ids)))).all()
    )
    groups = {
        gid: (name, currency)
        for gid, name, currency in (
            await db.execute(
                select(Group.id, Group.name, Group.currency).where(
                    Group.id.in_({a.group_id for a in rows})
                )
            )
        ).all()
    }

    def detail(a: Activity) -> dict | None:
        if a.verb in EXPENSE_VERBS and (e := expenses.get(a.target_id)):
            return {"description": e.description, "amount": e.amount_minor, "currency": e.currency}
        if a.verb in SETTLEMENT_VERBS and (s := settlements.get(a.target_id)):
            return {
                "description": f"{names.get(s.payer_id, '')} paid {names.get(s.payee_id, '')}",
                # settlement amounts are stored converted to the group currency
                "amount": s.amount_minor,
                "currency": groups[s.group_id][1],
            }
        return None

    return [
        {
            "id": a.id,
            "user_id": a.user_id,
            "user_name": names.get(a.user_id, ""),
            "group_id": a.group_id,
            "group_name": groups[a.group_id][0] if a.group_id in groups else "",
            "verb": a.verb,
            "target_id": a.target_id,
            "detail": detail(a),
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in rows
    ]


@router.get("/groups/{group_id}/activity")
async def group_activity(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    pair: tuple = Depends(get_group_member),
):
    rows = (
        await db.scalars(
            select(Activity)
            .where(Activity.group_id == pair[0].id)
            .order_by(Activity.created_at.desc(), Activity.id.desc())
            .limit(100)
        )
    ).all()
    return await _activity_out(db, rows)


@router.get("/activity")
async def my_activity(
    limit: int = 100,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Activity across every group the user belongs to, newest first."""
    rows = (
        await db.scalars(
            select(Activity)
            .where(
                Activity.group_id.in_(
                    select(Membership.group_id).where(Membership.user_id == user.id)
                )
            )
            .order_by(Activity.created_at.desc(), Activity.id.desc())
            .limit(min(max(limit, 1), 200))
        )
    ).all()
    return await _activity_out(db, rows)
