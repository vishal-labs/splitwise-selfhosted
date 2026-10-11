import datetime as dt
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.activity import log_activity
from app.auth import get_current_user, get_db
from app.config import settings
from app.models import Membership, Settlement, User
from app.routers.groups import get_group_member
from app.schemas import SettlementCreate, SettlementOut, settlement_out
from app.services.money import convert
from app.services.rates import get_rate

router = APIRouter(prefix="/api", tags=["settlements"])

ALLOWED_EXTS = {"png", "jpg", "jpeg", "webp", "pdf"}
MAX_SIZE = 5 * 1024 * 1024


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
    await db.flush()  # assign settlement.id before it's logged
    await log_activity(db, group.id, user.id, "settlement_recorded", target_id=settlement.id)
    await db.commit()
    await db.refresh(settlement)
    return settlement_out(settlement)


@router.get("/groups/{group_id}/settlements", response_model=list[SettlementOut])
async def list_settlements(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    pair: tuple = Depends(get_group_member),
):
    group, _ = pair
    rows = (
        await db.scalars(
            select(Settlement)
            .where(Settlement.group_id == group.id)
            .order_by(Settlement.date.desc(), Settlement.id.desc())
        )
    ).all()
    return [settlement_out(s) for s in rows]


async def _get_settlement(
    settlement_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Settlement:
    """404 unless the settlement exists and the user is in its group."""
    settlement = await db.get(Settlement, settlement_id)
    if settlement is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    m = await db.scalar(
        select(Membership).where(
            Membership.group_id == settlement.group_id, Membership.user_id == user.id
        )
    )
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    return settlement


@router.post("/settlements/{settlement_id}/proof")
async def upload_proof(
    settlement_id: int,
    file: UploadFile,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    settlement: Settlement = Depends(_get_settlement),
):
    ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else ""
    if ext not in ALLOWED_EXTS:
        raise HTTPException(422, "Allowed: png/jpg/jpeg/webp/pdf")
    # chunked read so an oversized body 413s before it's fully buffered in memory
    size = 0
    chunks: list[bytes] = []
    while chunk := await file.read(1024 * 1024):
        size += len(chunk)
        if size > MAX_SIZE:
            raise HTTPException(413, "Max 5MB")
        chunks.append(chunk)

    directory = Path(settings.upload_dir)
    directory.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}.{ext}"
    (directory / name).write_bytes(b"".join(chunks))
    old = settlement.proof_path
    settlement.proof_path = name
    await db.commit()
    if old:
        try:
            os.unlink(Path(settings.upload_dir) / old)
        except FileNotFoundError:
            pass
    return {"proof_path": name}


@router.get("/settlements/{settlement_id}/proof")
async def get_proof(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    settlement: Settlement = Depends(_get_settlement),
):
    if not settlement.proof_path:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No proof")
    path = Path(settings.upload_dir) / settlement.proof_path
    if not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No proof")
    return FileResponse(path)
