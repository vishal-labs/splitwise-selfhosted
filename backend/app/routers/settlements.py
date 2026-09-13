import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.activity import log_activity
from app.auth import get_current_user, get_db
from app.models import Membership, Settlement, User
from app.routers.groups import get_group_member
from app.schemas import SettlementCreate, SettlementOut
from app.services.money import convert
from app.services.rates import get_rate

router = APIRouter(prefix="/api", tags=["settlements"])


@router.post("/groups/{group_id}/settlements", response_model=SettlementOut)
async def create_settlement(
    group_id: int,
    payload: SettlementCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    pair: tuple = Depends(get_group_member),
):
    group, _ = pair
    member_ids = set(
        await db.scalars(
            select(Membership.user_id).where(Membership.group_id == group.id)
        )
    )
    if payload.payer_id not in member_ids or payload.payee_id not in member_ids:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payer and payee must be members")

    currency = payload.currency.upper()
    rate = None
    converted = payload.amount_minor
    if currency != group.currency:
        rate = await get_rate(db, currency, group.currency)
        converted = convert(payload.amount_minor, rate)

    settlement = Settlement(
        group_id=group.id,
        payer_id=payload.payer_id,
        payee_id=payload.payee_id,
        amount_minor=converted,
        currency=currency,
        rate=rate,
        date=dt.date.today(),
    )
    db.add(settlement)
    await log_activity(db, group.id, user.id, "settlement_recorded", target_id=settlement.id)
    await db.commit()
    await db.refresh(settlement)
    return SettlementOut(
        id=settlement.id,
        group_id=settlement.group_id,
        payer_id=settlement.payer_id,
        payee_id=settlement.payee_id,
        amount_minor=settlement.amount_minor,
        currency=settlement.currency,
        rate=settlement.rate,
        date=settlement.date,
    )
