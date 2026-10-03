import asyncio
import sys


async def _seed_user(db_url, email="user@example.com", password="oldpassword"):
    from app.auth import pwd
    from app.db import SessionLocal, init
    from app.models import User

    await init()
    async with SessionLocal() as db:
        db.add(User(email=email, name="Test User", password_hash=pwd.hash(password)))
        await db.commit()


async def test_set_password_changes_hash(db_url):
    from app.auth import verify_password
    from app.cli import set_password
    from app.db import SessionLocal, init
    from app.models import User

    await init()
    await _seed_user(db_url)
    assert await set_password("user@example.com", "newpassword123")

    async with SessionLocal() as db:
        user = (
            await db.execute(
                User.__table__.select().where(User.__table__.c.email == "user@example.com")
            )
        ).first()
        assert verify_password(User(**user._mapping), "newpassword123")
        assert not verify_password(User(**user._mapping), "oldpassword")


async def test_set_password_unknown_email(db_url):
    from app.cli import set_password
    from app.db import init

    await init()
    assert not await set_password("nobody@example.com", "newpassword123")


def test_main_mismatched_confirmation(db_url, monkeypatch, capsys):
    asyncio.run(_seed_user(db_url))
    from app import cli

    monkeypatch.setattr(sys, "argv", ["app.cli", "reset-password", "user@example.com"])
    prompts = iter(["newpassword123", "different123"])
    monkeypatch.setattr(cli.getpass, "getpass", lambda _prompt: next(prompts))

    assert cli.main() == 1
    assert "do not match" in capsys.readouterr().err


def test_main_success(db_url, monkeypatch, capsys):
    asyncio.run(_seed_user(db_url))
    from app import cli
    from app.auth import verify_password
    from app.db import SessionLocal
    from app.models import User

    monkeypatch.setattr(sys, "argv", ["app.cli", "reset-password", "user@example.com"])
    monkeypatch.setattr(cli.getpass, "getpass", lambda _prompt: "newpassword123")

    assert cli.main() == 0
    assert "Password updated" in capsys.readouterr().out

    async def check():
        async with SessionLocal() as db:
            user = (
                await db.execute(
                    User.__table__.select().where(
                        User.__table__.c.email == "user@example.com"
                    )
                )
            ).first()
            assert verify_password(User(**user._mapping), "newpassword123")

    asyncio.run(check())
