import csv
import datetime as dt
import io

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, get_db
from app.models import Activity, Expense, Rate, User
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
    group, _ = pair
    window = _cutoff(max(1, months))
    total = func.coalesce(Expense.converted_amount_minor, Expense.amount_minor)

    monthly = (
        await db.execute(
            select(func.strftime("%Y-%m", Expense.date), func.sum(total))
            .where(Expense.group_id == group.id, Expense.date >= window)
            .group_by(func.strftime("%Y-%m", Expense.date))
            .order_by(func.strftime("%Y-%m", Expense.date))
        )
    ).all()
    by_category = (
        await db.execute(
            select(Expense.category, func.sum(total))
            .where(Expense.group_id == group.id, Expense.date >= window)
            .group_by(Expense.category)
            .order_by(func.sum(total).desc())
        )
    ).all()
    return {
        "monthly": [{"month": m, "total": t} for m, t in monthly],
        "by_category": [{"category": c or "Other", "total": t} for c, t in by_category],
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
            .where(Expense.group_id == group.id)
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
    users = {
        u.id: u.name
        for u in (await db.scalars(select(User))).all()
    }
    return [
        {
            "id": a.id,
            "user_id": a.user_id,
            "user_name": users.get(a.user_id, ""),
            "verb": a.verb,
            "target_id": a.target_id,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in rows
    ]


@router.get("/rates")
async def list_rates(
    base: str = "EUR",
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.services import rates as rates_svc

    try:
        eur = await rates_svc._fetch_eur_rates()
    except Exception:
        eur = {r.quote: r.rate for r in (await db.scalars(select(Rate).where(Rate.base == "EUR"))).all()}
        if not eur:
            raise HTTPException(503, "Rates unavailable (offline?)")
    b = base.upper()
    if b == "EUR":
        return {"base": "EUR", "rates": eur}
    base_rate = eur.get(b)
    if not base_rate:
        raise HTTPException(422, f"Unknown currency {b}")
    return {"base": b, "rates": {q: r / base_rate for q, r in eur.items()}}
