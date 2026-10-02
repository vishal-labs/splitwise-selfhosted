import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.activity import log_activity
from app.auth import get_current_user, get_db
from app.models import (
    Activity,
    Comment,
    Expense,
    ExpenseSplit,
    Group,
    Membership,
    RecurringRule,
    Settlement,
    User,
)
from app.schemas import GroupCreate, GroupDetail, GroupOut, MemberAdd, MemberOut
from app.services.balances import group_net_balances

router = APIRouter(prefix="/api/groups", tags=["groups"])


async def get_group_member(
    group_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> tuple[Group, Membership]:
    """404 unless the current user is a member of the group (don't leak existence)."""
    group = await db.get(Group, group_id)
    if group is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    m = await db.scalar(
        select(Membership).where(
            Membership.group_id == group_id, Membership.user_id == user.id
        )
    )
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    return group, m


@router.post("", response_model=GroupOut)
async def create_group(
    payload: GroupCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    group = Group(
        name=payload.name,
        currency=payload.currency.upper(),
        created_by=user.id,
        invite_code=secrets.token_hex(3),
    )
    db.add(group)
    await db.flush()
    db.add(Membership(group_id=group.id, user_id=user.id, role="admin"))
    await log_activity(db, group.id, user.id, "created_group", target_id=group.id)
    await db.commit()
    await db.refresh(group)
    return GroupOut(
        id=group.id,
        name=group.name,
        currency=group.currency,
        created_by=group.created_by,
        invite_code=group.invite_code,
        member_count=1,
    )


@router.post("/join/{code}", response_model=GroupOut)
async def join_by_invite(
    code: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    group = await db.scalar(select(Group).where(Group.invite_code == code))
    if group is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    existing = await db.scalar(
        select(Membership).where(
            Membership.group_id == group.id, Membership.user_id == user.id
        )
    )
    if existing is None:
        db.add(Membership(group_id=group.id, user_id=user.id, role="member"))
        await log_activity(db, group.id, user.id, "joined", target_id=group.id)
        await db.commit()
    count = await db.scalar(
        select(func.count()).select_from(Membership).where(Membership.group_id == group.id)
    )
    return GroupOut(
        id=group.id,
        name=group.name,
        currency=group.currency,
        created_by=group.created_by,
        invite_code=group.invite_code,
        member_count=count or 1,
    )


@router.get("")
async def list_groups(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    group_ids = (
        await db.scalars(select(Membership.group_id).where(Membership.user_id == user.id))
    ).all()
    if not group_ids:
        return []
    groups = (await db.scalars(select(Group).where(Group.id.in_(group_ids)))).all()
    counts = dict(
        (
            await db.execute(
                select(Membership.group_id, func.count())
                .where(Membership.group_id.in_(group_ids))
                .group_by(Membership.group_id)
            )
        ).all()
    )
    return [
        GroupOut(
            id=g.id,
            name=g.name,
            currency=g.currency,
            created_by=g.created_by,
            invite_code=g.invite_code,
            member_count=counts.get(g.id, 0),
        )
        for g in groups
    ]


@router.get("/{group_id}", response_model=GroupDetail)
async def get_group(
    pair: tuple[Group, Membership] = Depends(get_group_member),
    db: AsyncSession = Depends(get_db),
):
    group, _ = pair
    rows = (
        await db.execute(
            select(User, Membership.role)
            .join(Membership, Membership.user_id == User.id)
            .where(Membership.group_id == group.id)
        )
    ).all()
    return GroupDetail(
        id=group.id,
        name=group.name,
        currency=group.currency,
        created_by=group.created_by,
        invite_code=group.invite_code,
        member_count=len(rows),
        members=[
            MemberOut(
                id=u.id,
                email=u.email,
                name=u.name,
                role=role,
                upi_id=u.upi_id,
                has_upi_qr=bool(u.upi_qr_path),
            )
            for u, role in rows
        ],
    )


@router.post("/{group_id}/members")
async def add_member(
    group_id: int,
    payload: MemberAdd,
    pair: tuple[Group, Membership] = Depends(get_group_member),
    db: AsyncSession = Depends(get_db),
):
    group, _ = pair
    target = await db.scalar(select(User).where(User.email == payload.email))
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No user with that email")
    existing = await db.scalar(
        select(Membership).where(
            Membership.group_id == group.id, Membership.user_id == target.id
        )
    )
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Already a member")
    db.add(Membership(group_id=group.id, user_id=target.id))
    await log_activity(db, group.id, target.id, "joined", target_id=target.id)
    await db.commit()
    return {"id": target.id, "email": target.email, "name": target.name}


@router.delete("/{group_id}/members/{user_id}")
async def remove_member(
    user_id: int,
    pair: tuple[Group, Membership] = Depends(get_group_member),
    db: AsyncSession = Depends(get_db),
):
    group, me = pair
    # self-leave always allowed; removing others requires admin
    if user_id != me.user_id and me.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only admins can remove members")
    m = await db.scalar(
        select(Membership).where(
            Membership.group_id == group.id, Membership.user_id == user_id
        )
    )
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not a member")
    # last-admin guard: group would be left without an admin
    if m.role == "admin":
        counts = await db.execute(
            select(Membership.role, func.count())
            .where(Membership.group_id == group.id)
            .group_by(Membership.role)
        )
        by_role = dict(counts.all())
        if by_role.get("admin", 0) == 1 and sum(by_role.values()) > 1:
            raise HTTPException(status.HTTP_409_CONFLICT, "Last admin can't leave")
    # debt guard: departing member must be square
    balances = await group_net_balances(db, group.id)
    if balances.get(user_id, 0) != 0:
        raise HTTPException(status.HTTP_409_CONFLICT, "Settle up before leaving")
    await db.delete(m)
    await log_activity(
        db, group.id, user_id, "left" if user_id == me.user_id else "removed", target_id=user_id
    )
    await db.commit()
    return {"ok": True}


@router.delete("/{group_id}")
async def delete_group(
    pair: tuple[Group, Membership] = Depends(get_group_member),
    db: AsyncSession = Depends(get_db),
):
    group, _ = pair
    if group.created_by != _.user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the creator can delete the group")
    # core deletes, FK-safe order: children of expenses first, expenses before rules
    await db.execute(
        delete(Comment).where(
            Comment.expense_id.in_(select(Expense.id).where(Expense.group_id == group.id))
        )
    )
    await db.execute(
        delete(ExpenseSplit).where(
            ExpenseSplit.expense_id.in_(select(Expense.id).where(Expense.group_id == group.id))
        )
    )
    await db.execute(delete(Expense).where(Expense.group_id == group.id))
    await db.execute(delete(RecurringRule).where(RecurringRule.group_id == group.id))
    await db.execute(delete(Settlement).where(Settlement.group_id == group.id))
    await db.execute(delete(Membership).where(Membership.group_id == group.id))
    await db.execute(delete(Activity).where(Activity.group_id == group.id))
    await db.execute(delete(Group).where(Group.id == group.id))
    await db.commit()
    return {"ok": True}
