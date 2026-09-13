import re


async def test_register_login_me_logout(client):
    r = await client.post(
        "/api/users/register",
        json={"email": "a@b.com", "name": "Alice", "password": "hunter2hunter"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["email"] == "a@b.com" and body["name"] == "Alice"
    assert "password" not in body and "password_hash" not in body
    assert "session=" in r.headers["set-cookie"]
    assert "HttpOnly" in r.headers["set-cookie"]
    assert "samesite=lax" in r.headers["set-cookie"].lower()

    r = await client.get("/api/users/me")
    assert r.status_code == 200
    assert r.json()["email"] == "a@b.com"

    r = await client.post("/api/users/logout")
    assert r.status_code == 200
    assert re.search(r"session=;|session=\"\"", r.headers["set-cookie"])  # cleared

    r = await client.get("/api/users/me")
    assert r.status_code == 401


async def test_login_and_logout_endpoint(client):
    await client.post(
        "/api/users/register",
        json={"email": "b@b.com", "name": "Bob", "password": "hunter2hunter"},
    )
    r = await client.post("/api/users/logout")
    assert r.status_code == 200

    r = await client.post(
        "/api/users/login", json={"email": "b@b.com", "password": "hunter2hunter"}
    )
    assert r.status_code == 200
    assert r.json()["email"] == "b@b.com"
    assert "session=" in r.headers["set-cookie"]


async def test_duplicate_email_409(client):
    payload = {"email": "c@b.com", "name": "C", "password": "hunter2hunter"}
    assert (await client.post("/api/users/register", json=payload)).status_code == 200
    r = await client.post("/api/users/register", json=payload)
    assert r.status_code == 409


async def test_login_wrong_password_401(client):
    await client.post(
        "/api/users/register",
        json={"email": "d@b.com", "name": "D", "password": "hunter2hunter"},
    )
    r = await client.post(
        "/api/users/login", json={"email": "d@b.com", "password": "wrongpassword"}
    )
    assert r.status_code == 401


async def test_me_unauthenticated_401(client):
    r = await client.get("/api/users/me")
    assert r.status_code == 401


async def test_expired_session_401(client):
    from datetime import datetime, timedelta, timezone

    from sqlalchemy import delete

    from app.auth import hash_token
    from app.db import SessionLocal
    from app.models import Session as SessionRow

    r = await client.post(
        "/api/users/register",
        json={"email": "e@b.com", "name": "E", "password": "hunter2hunter"},
    )
    token = r.cookies["session"]
    async with SessionLocal() as db:
        await db.execute(delete(SessionRow))
        db.add(
            SessionRow(
                token_hash=hash_token(token),
                user_id=r.json()["id"],
                expires_at=datetime.now(timezone.utc) - timedelta(days=1),
            )
        )
        await db.commit()

    client.cookies.set("session", token)
    assert (await client.get("/api/users/me")).status_code == 401
