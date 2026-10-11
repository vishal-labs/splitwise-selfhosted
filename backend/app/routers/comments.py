import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.activity import log_activity
from app.auth import get_current_user, get_db
from app.models import Comment, Expense, Membership, User
from app.schemas import CommentCreate, CommentOut

router = APIRouter(prefix="/api", tags=["comments"])


async def get_expense_member(
    expense_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> Expense:
    """404 unless the expense exists and the user is in its group."""
    expense = await db.get(Expense, expense_id)
    if expense is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    m = await db.scalar(
        select(Membership).where(
            Membership.group_id == expense.group_id, Membership.user_id == user.id
        )
    )
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    return expense


@router.post("/expenses/{expense_id}/comments", response_model=CommentOut)
async def create_comment(
    expense_id: int,
    payload: CommentCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    expense: Expense = Depends(get_expense_member),
):
    row = Comment(expense_id=expense.id, user_id=user.id, body=payload.body)
    db.add(row)
    await log_activity(db, expense.group_id, user.id, "commented", target_id=expense.id)
    await db.commit()
    await db.refresh(row)
    return CommentOut.model_validate(row)


@router.get("/expenses/{expense_id}/comments", response_model=list[CommentOut])
async def list_comments(
    db: AsyncSession = Depends(get_db),
    expense: Expense = Depends(get_expense_member),
):
    rows = (
        await db.scalars(
            select(Comment).where(Comment.expense_id == expense.id).order_by(Comment.id)
        )
    ).all()
    return [CommentOut.model_validate(c) for c in rows]


async def _own_comment(comment_id: int, expense: Expense, user: User, db: AsyncSession) -> Comment:
    """The comment, if it's on `expense` (else 404) and written by `user` (else 403)."""
    comment = await db.get(Comment, comment_id)
    if comment is None or comment.expense_id != expense.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if comment.user_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only your own comments")
    return comment


@router.patch("/expenses/{expense_id}/comments/{comment_id}", response_model=CommentOut)
async def edit_comment(
    comment_id: int,
    payload: CommentCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    expense: Expense = Depends(get_expense_member),
):
    comment = await _own_comment(comment_id, expense, user, db)
    comment.body = payload.body
    comment.updated_at = dt.datetime.now(dt.UTC).replace(tzinfo=None)
    await db.commit()
    return CommentOut.model_validate(comment)


@router.delete("/expenses/{expense_id}/comments/{comment_id}")
async def delete_comment(
    comment_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    expense: Expense = Depends(get_expense_member),
):
    comment = await _own_comment(comment_id, expense, user, db)
    await db.delete(comment)
    await db.commit()
    return {"ok": True}
