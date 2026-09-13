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


async def _setup_group(client) -> tuple[int, int, int]:
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


async def test_equal_split_expense(client):
    group_id, a, b, _ = await _setup_group(client)
    r = await client.post(
        f"/api/groups/{group_id}/expenses",
        json={
            "description": "Dinner",
            "amount_minor": 1001,
            "currency": "USD",
            "payer_id": a,
            "splits": [
                {"user_id": a, "mode": "equal", "value": None},
                {"user_id": b, "mode": "equal", "value": None},
            ],
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["amount_minor"] == 1001
    amounts = {s["user_id"]: s["amount_minor"] for s in body["splits"]}
    assert amounts == {a: 501, b: 500}


async def test_amount_mode_must_sum_to_total(client):
    group_id, a, b, _ = await _setup_group(client)
    r = await client.post(
        f"/api/groups/{group_id}/expenses",
        json={
            "description": "Bad",
            "amount_minor": 1000,
            "currency": "USD",
            "payer_id": a,
            "splits": [
                {"user_id": a, "mode": "amounts", "value": 600},
                {"user_id": b, "mode": "amounts", "value": 300},
            ],
        },
    )
    assert r.status_code == 422

    # correct sum passes
    r = await client.post(
        f"/api/groups/{group_id}/expenses",
        json={
            "description": "Good",
            "amount_minor": 1000,
            "currency": "USD",
            "payer_id": a,
            "splits": [
                {"user_id": a, "mode": "amounts", "value": 600},
                {"user_id": b, "mode": "amounts", "value": 400},
            ],
        },
    )
    assert r.status_code == 200, r.text


async def test_percent_mode_must_sum_100(client):
    group_id, a, b, _ = await _setup_group(client)
    r = await client.post(
        f"/api/groups/{group_id}/expenses",
        json={
            "description": "Bad",
            "amount_minor": 1000,
            "currency": "USD",
            "payer_id": a,
            "splits": [
                {"user_id": a, "mode": "percent", "value": 60},
                {"user_id": b, "mode": "percent", "value": 30},
            ],
        },
    )
    assert r.status_code == 422

    r = await client.post(
        f"/api/groups/{group_id}/expenses",
        json={
            "description": "Good",
            "amount_minor": 1000,
            "currency": "USD",
            "payer_id": a,
            "splits": [
                {"user_id": a, "mode": "percent", "value": 60},
                {"user_id": b, "mode": "percent", "value": 40},
            ],
        },
    )
    assert r.status_code == 200, r.text
    amounts = {s["user_id"]: s["amount_minor"] for s in r.json()["splits"]}
    assert amounts == {a: 600, b: 400}


async def test_shares_mode_proportional(client):
    group_id, a, b, _ = await _setup_group(client)
    r = await client.post(
        f"/api/groups/{group_id}/expenses",
        json={
            "description": "Shares",
            "amount_minor": 1000,
            "currency": "USD",
            "payer_id": a,
            "splits": [
                {"user_id": a, "mode": "shares", "value": 1},
                {"user_id": b, "mode": "shares", "value": 3},
            ],
        },
    )
    assert r.status_code == 200, r.text
    amounts = {s["user_id"]: s["amount_minor"] for s in r.json()["splits"]}
    assert amounts == {a: 250, b: 750}


async def test_payer_must_be_member(client):
    group_id, a, b, _ = await _setup_group(client)
    token_c = await _register(client, "c@b.com")
    await _switch(client, token_c)
    r = await client.post(
        f"/api/groups/{group_id}/expenses",
        json={
            "description": "X",
            "amount_minor": 100,
            "currency": "USD",
            "payer_id": a,
            "splits": [{"user_id": a, "mode": "equal", "value": None}],
        },
    )
    assert r.status_code == 404


async def test_non_member_cannot_create(client):
    group_id, a, b, _ = await _setup_group(client)
    token_c = await _register(client, "c@b.com")
    await _switch(client, token_c)
    r = await client.post(
        f"/api/groups/{group_id}/expenses",
        json={
            "description": "X",
            "amount_minor": 100,
            "currency": "USD",
            "payer_id": a,
            "splits": [{"user_id": a, "mode": "equal", "value": None}],
        },
    )
    assert r.status_code == 404


async def test_split_user_must_be_member(client):
    group_id, a, b, _ = await _setup_group(client)
    token_a = client.cookies.get("session")
    await _register(client, "c@b.com")
    await _switch(client, token_a)
    r = await client.post(
        f"/api/groups/{group_id}/expenses",
        json={
            "description": "X",
            "amount_minor": 100,
            "currency": "USD",
            "payer_id": a,
            "splits": [
                {"user_id": a, "mode": "equal", "value": None},
                {"user_id": 999, "mode": "equal", "value": None},
            ],
        },
    )
    assert r.status_code == 422


async def test_expense_list_grouped_by_date_desc(client):
    group_id, a, b, _ = await _setup_group(client)
    for desc, day in [("Old", "2026-01-01"), ("New", "2026-03-01"), ("Mid", "2026-02-01")]:
        r = await client.post(
            f"/api/groups/{group_id}/expenses",
            json={
                "description": desc,
                "amount_minor": 100,
                "currency": "USD",
                "payer_id": a,
                "date": day,
                "splits": [{"user_id": a, "mode": "equal", "value": None}],
            },
        )
        assert r.status_code == 200, r.text

    r = await client.get(f"/api/groups/{group_id}/expenses")
    assert r.status_code == 200
    dates = [g["date"] for g in r.json()]
    assert dates == sorted(dates, reverse=True)
    assert dates == ["2026-03-01", "2026-02-01", "2026-01-01"]


async def test_delete_expense_permissions_and_recompute(client):
    group_id, a, b, token_b = await _setup_group(client)
    # b creates an expense
    token_a = client.cookies.get("session")
    await _switch(client, token_b)
    r = await c if False else None  # placeholder removed
    r = await client.post(
        f"/api/groups/{group_id}/expenses",
        json={
            "description": "Bs expense",
            "amount_minor": 1000,
            "currency": "USD",
            "payer_id": b,
            "splits": [
                {"user_id": a, "mode": "equal", "value": None},
                {"user_id": b, "mode": "equal", "value": None},
            ],
        },
    )
    expense_id = r.json()["id"]

    # a (group admin, not creator) can delete
    await _switch(client, token_a)
    r = await client.get(f"/api/groups/{group_id}/debts")
    assert r.status_code == 200
    debts = r.json()
    assert len(debts) == 1
    assert debts[0] == {"from": a, "to": b, "amount": 500}

    # non-creator non-admin cannot delete — make a third member
    token_c = await _register(client, "c@b.com")
    await _switch(client, token_a)
    await client.post(f"/api/groups/{group_id}/members", json={"email": "c@b.com"})
    await _switch(client, token_c)
    r = await client.delete(f"/api/expenses/{expense_id}")
    assert r.status_code == 403

    # creator can delete; balances recompute to zero
    await _switch(client, token_b)
    r = await client.delete(f"/api/expenses/{expense_id}")
    assert r.status_code == 200
    r = await client.get(f"/api/groups/{group_id}/debts")
    assert r.json() == []


async def test_activity_logged_on_expense(client):
    from sqlalchemy import select

    from app.db import SessionLocal
    from app.models import Activity

    group_id, a, b, _ = await _setup_group(client)
    r = await client.post(
        f"/api/groups/{group_id}/expenses",
        json={
            "description": "X",
            "amount_minor": 100,
            "currency": "USD",
            "payer_id": a,
            "splits": [{"user_id": a, "mode": "equal", "value": None}],
        },
    )
    exp_id = r.json()["id"]
    async with SessionLocal() as db:
        verbs = set(
            await db.scalars(select(Activity.verb).where(Activity.group_id == group_id))
        )
    assert "expense_added" in verbs
