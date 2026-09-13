async def _register(client, email: str) -> str:
    client.cookies.clear()
    r = await client.post(
        "/api/users/register",
        json={"email": email, "name": email, "password": "hunter2hunter"},
    )
    assert r.status_code == 200
    return r.cookies["session"]


async def _switch(client, token: str) -> None:
    from httpx import Cookies

    jar = Cookies()
    jar.set("session", token)
    client.cookies = jar


async def _setup_group(client) -> tuple[int, int, int, str]:
    """Returns (group_id, user_a_id, user_b_id, token_b)."""
    token_a = await _register(client, "a@b.com")
    r = await client.post("/api/groups", json={"name": "Trip", "currency": "USD"})
    group_id = r.json()["id"]
    token_b = await _register(client, "b@b.com")
    await _switch(client, token_a)
    r = await client.post(f"/api/groups/{group_id}/members", json={"email": "b@b.com"})
    assert r.status_code == 200
    r = await client.get(f"/api/groups/{group_id}")
    members = {m["email"]: m["id"] for m in r.json()["members"]}
    return group_id, members["a@b.com"], members["b@b.com"], token_b


async def _add_expense(client, group_id: int, payer_id: int, payee_id: int, amount: int = 1000):
    r = await client.post(
        f"/api/groups/{group_id}/expenses",
        json={
            "description": "Dinner",
            "amount_minor": amount,
            "currency": "USD",
            "payer_id": payer_id,
            "splits": [
                {"user_id": payer_id, "mode": "equal", "value": None},
                {"user_id": payee_id, "mode": "equal", "value": None},
            ],
        },
    )
    assert r.status_code == 200, r.text


async def test_settlement_clears_debt(client):
    group_id, a, b, _ = await _setup_group(client)
    await _add_expense(client, group_id, a, b, 1000)
    r = await client.get(f"/api/groups/{group_id}/debts")
    assert r.json() == [{"from": b, "to": a, "amount": 500}]

    r = await client.post(
        f"/api/groups/{group_id}/settlements",
        json={"payer_id": b, "payee_id": a, "amount_minor": 500, "currency": "USD"},
    )
    assert r.status_code == 200, r.text

    r = await client.get(f"/api/groups/{group_id}/debts")
    assert r.json() == []


async def test_partial_settlement_reduces_debt(client):
    group_id, a, b, _ = await _setup_group(client)
    await _add_expense(client, group_id, a, b, 1000)
    r = await client.post(
        f"/api/groups/{group_id}/settlements",
        json={"payer_id": b, "payee_id": a, "amount_minor": 200, "currency": "USD"},
    )
    assert r.status_code == 200, r.text
    r = await client.get(f"/api/groups/{group_id}/debts")
    assert r.json() == [{"from": b, "to": a, "amount": 300}]


async def test_payer_not_member_404(client):
    group_id, a, b, _ = await _setup_group(client)
    r = await client.post(
        f"/api/groups/{group_id}/settlements",
        json={"payer_id": 999, "payee_id": a, "amount_minor": 500, "currency": "USD"},
    )
    assert r.status_code == 404


async def test_payee_not_member_404(client):
    group_id, a, b, _ = await _setup_group(client)
    r = await client.post(
        f"/api/groups/{group_id}/settlements",
        json={"payer_id": a, "payee_id": 999, "amount_minor": 500, "currency": "USD"},
    )
    assert r.status_code == 404


async def test_non_member_cannot_create(client):
    group_id, a, b, _ = await _setup_group(client)
    token_c = await _register(client, "c@b.com")
    await _switch(client, token_c)
    r = await client.post(
        f"/api/groups/{group_id}/settlements",
        json={"payer_id": b, "payee_id": a, "amount_minor": 500, "currency": "USD"},
    )
    assert r.status_code == 404


async def test_amount_must_be_positive(client):
    group_id, a, b, _ = await _setup_group(client)
    r = await client.post(
        f"/api/groups/{group_id}/settlements",
        json={"payer_id": b, "payee_id": a, "amount_minor": 0, "currency": "USD"},
    )
    assert r.status_code == 422


async def test_settlement_activity_logged(client):
    from sqlalchemy import select

    from app.db import SessionLocal
    from app.models import Activity, Settlement

    group_id, a, b, _ = await _setup_group(client)
    r = await client.post(
        f"/api/groups/{group_id}/settlements",
        json={"payer_id": b, "payee_id": a, "amount_minor": 500, "currency": "USD"},
    )
    assert r.status_code == 200, r.text
    settlement_id = r.json()["id"]
    async with SessionLocal() as db:
        verbs = set(
            await db.scalars(select(Activity.verb).where(Activity.group_id == group_id))
        )
        settlement = await db.get(Settlement, settlement_id)
    assert "settlement_recorded" in verbs
    assert settlement is not None
    assert settlement.amount_minor == 500
    assert settlement.currency == "USD"
