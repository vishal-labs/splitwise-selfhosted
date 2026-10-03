from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
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
from app.models import User
from app.schemas import UserCreate, UserLogin, UserOut, user_out

router = APIRouter(prefix="/api/users", tags=["users"])


@router.post("/register", response_model=UserOut)
async def register(payload: UserCreate, response: Response, db: AsyncSession = Depends(get_db)):
    existing = await db.scalar(select(User).where(User.email == payload.email))
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    user = User(email=payload.email, name=payload.name, password_hash=pwd.hash(payload.password))
    db.add(user)
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
