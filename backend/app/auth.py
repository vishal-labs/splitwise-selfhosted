from datetime import datetime, timedelta, timezone

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import SessionLocal
from app.models import Session, User

pwd = PasswordHasher()

COOKIE = "session"


def hash_token(token: str) -> str:
    # ponytail: plain SHA-256 per plan — token is 256-bit random, not user-chosen
    import hashlib

    return hashlib.sha256(token.encode()).hexdigest()


async def create_session(response: Response, user_id: int) -> None:
    import secrets

    token = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(days=settings.session_ttl_days)
    async with SessionLocal() as db:
        db.add(Session(token_hash=hash_token(token), user_id=user_id, expires_at=expires))
        await db.commit()
    response.set_cookie(
        COOKIE,
        token,
        max_age=settings.session_ttl_days * 86400,
        httponly=True,
        samesite="lax",
        path="/",
    )


async def get_db() -> AsyncSession:
    async with SessionLocal() as db:
        yield db


async def get_current_user(
    request: Request, db: AsyncSession = Depends(get_db)
) -> User:
    token = request.cookies.get(COOKIE)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED)
    row = await db.get(Session, hash_token(token))
    if row is None or row.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED)
    user = await db.get(User, row.user_id)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED)
    return user


def verify_password(user: User, password: str) -> bool:
    try:
        pwd.verify(user.password_hash, password)
        return True
    except (VerifyMismatchError, InvalidHashError):
        return False  # InvalidHash: invited-but-unregistered accounts (PENDING_HASH)
