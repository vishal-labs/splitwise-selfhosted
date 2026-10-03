"""Admin CLI: password reset and user listing.

Usage: python -m app.cli reset-password <email> | list-users
"""

import argparse
import asyncio
import getpass
import sys

from sqlalchemy import select

from app.auth import pwd, verify_password
from app.db import SessionLocal
from app.models import User


async def set_password(email: str, new_password: str) -> bool:
    """Set a user's password by email. Returns False if user not found."""
    async with SessionLocal() as db:
        user = (
            await db.execute(select(User).where(User.email == email))
        ).scalar_one_or_none()
        if user is None:
            return False
        user.password_hash = pwd.hash(new_password)
        await db.commit()
    return True


async def _list_users() -> None:
    async with SessionLocal() as db:
        users = (await db.execute(select(User).order_by(User.id))).scalars().all()
    for u in users:
        print(f"{u.id}\t{u.email}\t{u.name}")


def _prompt_new_password() -> str | None:
    """Prompt twice; returns the password or None on validation failure."""
    p1 = getpass.getpass("New password: ")
    p2 = getpass.getpass("Confirm password: ")
    if len(p1) < 8:
        print("Error: password must be at least 8 characters.", file=sys.stderr)
        return None
    if p1 != p2:
        print("Error: passwords do not match.", file=sys.stderr)
        return None
    return p1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="app.cli", description="Splitwise admin CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    reset = sub.add_parser("reset-password", help="Set a new password for a user")
    reset.add_argument("email")

    sub.add_parser("list-users", help="List all users")

    args = parser.parse_args(argv)

    if args.command == "list-users":
        asyncio.run(_list_users())
        return 0

    password = _prompt_new_password()
    if password is None:
        return 1
    ok = asyncio.run(set_password(args.email, password))
    if not ok:
        print(f"Error: no user with email {args.email!r}.", file=sys.stderr)
        return 1
    print(f"Password updated for {args.email}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
