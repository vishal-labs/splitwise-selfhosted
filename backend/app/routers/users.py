import os
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import (
    COOKIE,
    Session,
    create_session,
    get_current_user,
    get_db,
    hash_token,
    pwd,
    verify_password,
)
from app.config import settings
from app.models import Membership, User
from app.schemas import (
    PasswordChange,
    UserCreate,
    UserLogin,
    UserOut,
    UserUpdate,
    is_pending,
    user_out,
)

router = APIRouter(prefix="/api/users", tags=["users"])

VPA_RE = re.compile(r"^[A-Za-z0-9.\-_]{2,}@[A-Za-z0-9.\-]{2,}$")
ALLOWED_EXTS = {"png", "jpg", "jpeg", "webp", "pdf"}
MAX_SIZE = 5 * 1024 * 1024


@router.post("/register", response_model=UserOut)
async def register(payload: UserCreate, response: Response, db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.email == payload.email))
    if user is not None and not is_pending(user):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    if user is None:
        user = User(email=payload.email, name=payload.name, password_hash=pwd.hash(payload.password))
        db.add(user)
    else:
        # claim the account a friend invited by email: same id, so their
        # groups and balances carry over
        user.name = payload.name
        user.password_hash = pwd.hash(payload.password)
    await db.commit()
    await db.refresh(user)
    await create_session(response, user.id)
    return user_out(user)


@router.post("/login", response_model=UserOut)
async def login(payload: UserLogin, response: Response, db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.email == payload.email))
    if user is None or not verify_password(user, payload.password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    await create_session(response, user.id)
    return user_out(user)


@router.post("/logout")
async def logout(request: Request, db: AsyncSession = Depends(get_db)):
    token = request.cookies.get(COOKIE)
    if token:
        await db.execute(delete(Session).where(Session.token_hash == hash_token(token)))
        await db.commit()
    response = Response()
    response.delete_cookie(COOKIE, path="/")
    return response


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return user_out(user)


@router.patch("/me", response_model=UserOut)
async def update_me(
    payload: UserUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = payload.model_dump(exclude_unset=True)
    if data.get("upi_id") is not None and not VPA_RE.match(data["upi_id"]):
        raise HTTPException(422, "Invalid UPI ID")
    if "email" in data and data["email"] != user.email:
        # ponytail: no password re-entry on email change — self-hosted, single admin-ish user base
        taken = await db.scalar(select(User).where(User.email == data["email"]))
        if taken is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
        user.email = data["email"]
    if data.get("name") is not None:
        user.name = data["name"]
    if "upi_id" in data:
        user.upi_id = data["upi_id"]
    await db.commit()
    await db.refresh(user)
    return user_out(user)


@router.post("/me/password")
async def change_password(
    payload: PasswordChange,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(user, payload.current_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Current password is incorrect")
    user.password_hash = pwd.hash(payload.new_password)
    token = request.cookies.get(COOKIE)
    current_hash = hash_token(token) if token else ""
    await db.execute(
        delete(Session).where(
            Session.user_id == user.id, Session.token_hash != current_hash
        )
    )
    await db.commit()
    return {"ok": True}


@router.post("/me/upi-qr")
async def upload_upi_qr(
    file: UploadFile,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
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
    old = user.upi_qr_path
    user.upi_qr_path = name
    await db.commit()
    if old:
        try:
            os.unlink(Path(settings.upload_dir) / old)
        except FileNotFoundError:
            pass
    return {"has_upi_qr": True}


@router.delete("/me/upi-qr")
async def delete_upi_qr(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    old = user.upi_qr_path
    user.upi_qr_path = None
    await db.commit()
    if old:
        try:
            os.unlink(Path(settings.upload_dir) / old)
        except FileNotFoundError:
            pass
    return {"ok": True}


@router.get("/{user_id}/upi-qr")
async def get_user_upi_qr(
    user_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user_id != user.id:
        shared = await db.scalar(
            select(Membership).where(
                Membership.user_id == user.id,
                Membership.group_id.in_(
                    select(Membership.group_id).where(Membership.user_id == user_id)
                ),
            )
        )
        if shared is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND)
    target = await db.get(User, user_id)
    if target is None or not target.upi_qr_path:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    path = Path(settings.upload_dir) / target.upi_qr_path
    if not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    return FileResponse(path)
