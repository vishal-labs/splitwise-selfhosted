from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, get_db
from app.models import Group, Membership, User
from app.schemas import is_pending
from app.services.balances import group_debts

router = APIRouter(prefix="/api", tags=["friends"])


@router.get("/friends")
async def list_friends(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    """Everyone you share a group with, and where you stand with each of them.

    Amounts are from your side: positive = they owe you. Each group contributes
    the debts between you two as shown on its Balances tab (so simplified debts
    count when the group simplifies). Totals are per currency — never converted.
    """
    my_groups = (
        await db.scalars(
            select(Group).join(Membership, Membership.group_id == Group.id).where(
                Membership.user_id == user.id
            )
        )
    ).all()
    rows = (
        await db.execute(
            select(User, Membership.group_id)
            .join(Membership, Membership.user_id == User.id)
            .where(
                Membership.group_id.in_([g.id for g in my_groups]),
                User.id != user.id,
            )
        )
    ).all()
    friends: dict[int, dict] = {}
    for u, _gid in rows:
        friends.setdefault(
            u.id,
            {
                "id": u.id,
                "name": u.name,
                "email": u.email,
                "upi_id": u.upi_id,
                "has_upi_qr": bool(u.upi_qr_path),
                "pending": is_pending(u),
                "groups": [],
                "_totals": {},
            },
        )

    for g in my_groups:
        net: dict[int, int] = {}
        for frm, to, amount in await group_debts(db, g):
            if to == user.id:
                net[frm] = net.get(frm, 0) + amount
            elif frm == user.id:
                net[to] = net.get(to, 0) - amount
        for fid, amount in net.items():
            if amount == 0 or fid not in friends:
                continue
            f = friends[fid]
            f["groups"].append(
                {"group_id": g.id, "group_name": g.name, "currency": g.currency, "amount": amount}
            )
            f["_totals"][g.currency] = f["_totals"].get(g.currency, 0) + amount

    out = []
    for f in friends.values():
        totals = f.pop("_totals")
        f["balances"] = [
            {"currency": c, "amount": a} for c, a in sorted(totals.items()) if a != 0
        ]
        out.append(f)
    # people with open balances first (largest first), then alphabetical
    out.sort(
        key=lambda f: (
            not f["balances"],
            -max((abs(b["amount"]) for b in f["balances"]), default=0),
            f["name"].lower(),
        )
    )
    return out
