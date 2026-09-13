async def _register(client, email: str) -> str:
    """Register a user, return their session token."""
    r = await client.post(
        "/api/users/register",
        json={"email": email, "name": email, "password": "hunter2hunter"},
    )
    assert r.status_code == 200
    return r.cookies["session"]


async def _switch(client, token: str) -> None:
    client.cookies.clear()  # register's Set-Cookie can leave a stale duplicate
    client.cookies.set("session", token)


async def test_create_group_creator_auto_member(client):
    token = await _register(client, "a@b.com")
    r = await client.post(
        "/api/groups", json={"name": "Trip", "currency": "USD"}
    )
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Trip"
    assert body["currency"] == "USD"
    assert len(body["invite_code"]) == 6
    assert body["member_count"] == 1

    r = await client.get(f"/api/groups/{body['id']}")
    assert r.status_code == 200
    members = r.json()["members"]
    assert len(members) == 1
    assert members[0]["email"] == "a@b.com"
    assert members[0]["role"] == "admin"


async def test_list_own_groups_only(client):
    token_a = await _register(client, "a@b.com")
    r = await client.post("/api/groups", json={"name": "Mine", "currency": "USD"})
    group_id = r.json()["id"]

    token_b = await _register(client, "b@b.com")
    await _switch(client, token_b)
    r = await client.get("/api/groups")
    assert r.status_code == 200
    assert r.json() == []  # b sees nothing

    r = await client.get(f"/api/groups/{group_id}")
    assert r.status_code == 404  # non-member read is 404

    await _switch(client, token_a)
    r = await client.get("/api/groups")
    assert r.status_code == 200
    groups = r.json()
    assert len(groups) == 1
    assert groups[0]["id"] == group_id
    assert groups[0]["member_count"] == 1


async def test_add_member_by_email(client):
    token_a = await _register(client, "a@b.com")
    r = await client.post("/api/groups", json={"name": "Trip", "currency": "USD"})
    group_id = r.json()["id"]
    await _register(client, "b@b.com")
    await _switch(client, token_a)

    r = await client.post(f"/api/groups/{group_id}/members", json={"email": "b@b.com"})
    assert r.status_code == 200

    r = await client.get(f"/api/groups/{group_id}")
    assert len(r.json()["members"]) == 2

    # duplicate join → 409
    r = await client.post(f"/api/groups/{group_id}/members", json={"email": "b@b.com"})
    assert r.status_code == 409

    # unknown email → 404
    r = await client.post(
        f"/api/groups/{group_id}/members", json={"email": "no@b.com"}
    )
    assert r.status_code == 404


async def test_non_member_cannot_add_members_or_read(client):
    token_a = await _register(client, "a@b.com")
    r = await client.post("/api/groups", json={"name": "Trip", "currency": "USD"})
    group_id = r.json()["id"]
    await _register(client, "b@b.com")  # client now b

    r = await client.post(f"/api/groups/{group_id}/members", json={"email": "b@b.com"})
    assert r.status_code == 404
    r = await client.get(f"/api/groups/{group_id}")
    assert r.status_code == 404


async def test_leave_group(client):
    token_a = await _register(client, "a@b.com")
    r = await client.post("/api/groups", json={"name": "Trip", "currency": "USD"})
    group_id = r.json()["id"]
    token_b = await _register(client, "b@b.com")
    await _switch(client, token_a)
    await client.post(f"/api/groups/{group_id}/members", json={"email": "b@b.com"})

    # b leaves
    await _switch(client, token_b)
    r = await client.get(f"/api/groups/{group_id}")
    b_id = next(
        m["id"] for m in r.json()["members"] if m["email"] == "b@b.com"
    )
    r = await client.delete(f"/api/groups/{group_id}/members/{b_id}")
    assert r.status_code == 200

    r = await client.get(f"/api/groups/{group_id}")
    assert r.status_code == 404  # no longer a member

    # non-member cannot remove someone else
    r = await client.delete(f"/api/groups/{group_id}/members/{b_id}")
    assert r.status_code == 404


async def test_debt_guard_on_removal_and_leave(client):
    token_a = await _register(client, "a@b.com")
    r = await client.post("/api/groups", json={"name": "Trip", "currency": "USD"})
    group_id = r.json()["id"]
    token_b = await _register(client, "b@b.com")
    await _switch(client, token_a)
    await client.post(f"/api/groups/{group_id}/members", json={"email": "b@b.com"})
    r = await client.get(f"/api/groups/{group_id}")
    members = {m["email"]: m["id"] for m in r.json()["members"]}
    a, b = members["a@b.com"], members["b@b.com"]

    # a paid, b owes 500
    r = await client.post(
        f"/api/groups/{group_id}/expenses",
        json={
            "description": "Dinner",
            "amount_minor": 1000,
            "currency": "USD",
            "payer_id": a,
            "splits": [
                {"user_id": a, "mode": "equal", "value": None},
                {"user_id": b, "mode": "equal", "value": None},
            ],
        },
    )
    assert r.status_code == 200

    # admin removes indebted b → 409
    r = await client.delete(f"/api/groups/{group_id}/members/{b}")
    assert r.status_code == 409
    assert "Settle up" in r.json()["detail"]

    # b can't self-leave either
    await _switch(client, token_b)
    r = await client.delete(f"/api/groups/{group_id}/members/{b}")
    assert r.status_code == 409

    # settle up → removal succeeds
    r = await client.post(
        f"/api/groups/{group_id}/settlements",
        json={"payer_id": b, "payee_id": a, "amount_minor": 500, "currency": "USD"},
    )
    assert r.status_code == 200
    r = await client.delete(f"/api/groups/{group_id}/members/{b}")
    assert r.status_code == 200


async def test_last_admin_cannot_leave(client):
    token_a = await _register(client, "a@b.com")
    r = await client.post("/api/groups", json={"name": "Trip", "currency": "USD"})
    group_id = r.json()["id"]
    token_b = await _register(client, "b@b.com")
    await _switch(client, token_a)
    await client.post(f"/api/groups/{group_id}/members", json={"email": "b@b.com"})
    r = await client.get(f"/api/groups/{group_id}")
    members = {m["email"]: m["id"] for m in r.json()["members"]}
    a, b = members["a@b.com"], members["b@b.com"]

    # a is the only admin → 409
    r = await client.delete(f"/api/groups/{group_id}/members/{a}")
    assert r.status_code == 409
    assert "Last admin" in r.json()["detail"]

    # b (plain member, zero balance) can still leave
    await _switch(client, token_b)
    r = await client.delete(f"/api/groups/{group_id}/members/{b}")
    assert r.status_code == 200


async def test_activity_logged(client):
    from sqlalchemy import select

    from app.db import SessionLocal
    from app.models import Activity

    token_a = await _register(client, "a@b.com")
    r = await client.post("/api/groups", json={"name": "Trip", "currency": "USD"})
    group_id = r.json()["id"]
    await _register(client, "b@b.com")
    await _switch(client, token_a)
    await client.post(f"/api/groups/{group_id}/members", json={"email": "b@b.com"})

    async with SessionLocal() as db:
        verbs = set(
            await db.scalars(
                select(Activity.verb).where(Activity.group_id == group_id)
            )
        )
    assert "created_group" in verbs
    assert "joined" in verbs


async def test_delete_group(client):
    from sqlalchemy import func, select

    from app.db import SessionLocal
    from app.models import Comment, Expense, ExpenseSplit, Group, Settlement

    token_a = await _register(client, "a@b.com")
    r = await client.post("/api/groups", json={"name": "Trip", "currency": "USD"})
    group_id = r.json()["id"]
    token_b = await _register(client, "b@b.com")
    await _switch(client, token_a)
    await client.post(f"/api/groups/{group_id}/members", json={"email": "b@b.com"})
    r = await client.get(f"/api/groups/{group_id}")
    members = {m["email"]: m["id"] for m in r.json()["members"]}
    a, b = members["a@b.com"], members["b@b.com"]

    r = await client.post(
        f"/api/groups/{group_id}/expenses",
        json={
            "description": "Dinner",
            "amount_minor": 1000,
            "currency": "USD",
            "payer_id": a,
            "splits": [
                {"user_id": a, "mode": "equal", "value": None},
                {"user_id": b, "mode": "equal", "value": None},
            ],
        },
    )
    assert r.status_code == 200
    expense_id = r.json()["id"]
    r = await client.post(
        f"/api/expenses/{expense_id}/comments", json={"body": "yum"}
    )
    assert r.status_code == 200
    r = await client.post(
        f"/api/groups/{group_id}/settlements",
        json={"payer_id": b, "payee_id": a, "amount_minor": 500, "currency": "USD"},
    )
    assert r.status_code == 200

    # non-creator member cannot delete
    await _switch(client, token_b)
    r = await client.delete(f"/api/groups/{group_id}")
    assert r.status_code == 403

    # non-member cannot delete
    token_c = await _register(client, "c@b.com")
    r = await client.delete(f"/api/groups/{group_id}")
    assert r.status_code == 404

    # creator deletes
    await _switch(client, token_a)
    r = await client.delete(f"/api/groups/{group_id}")
    assert r.status_code == 200
    assert r.json() == {"ok": True}

    # group gone for former members
    await _switch(client, token_b)
    r = await client.get(f"/api/groups/{group_id}")
    assert r.status_code == 404

    # cascade really happened
    async with SessionLocal() as db:
        assert await db.scalar(select(func.count()).select_from(Group).where(Group.id == group_id)) == 0
        assert await db.scalar(select(func.count()).select_from(Expense).where(Expense.group_id == group_id)) == 0
        assert await db.scalar(select(func.count()).select_from(ExpenseSplit).where(ExpenseSplit.expense_id == expense_id)) == 0
        assert await db.scalar(select(func.count()).select_from(Comment).where(Comment.expense_id == expense_id)) == 0
        assert await db.scalar(select(func.count()).select_from(Settlement).where(Settlement.group_id == group_id)) == 0


async def test_join_by_invite(client):
    from httpx import Cookies

    r = await client.post(
        "/api/users/register",
        json={"email": "a@b.com", "name": "a", "password": "hunter2hunter"},
    )
    tok_a = r.cookies["session"]
    r = await client.post("/api/groups", json={"name": "T", "currency": "USD"})
    code = r.json()["invite_code"]

    jar = Cookies()
    await client.post(
        "/api/users/register",
        json={"email": "b@b.com", "name": "b", "password": "hunter2hunter"},
    )
    tok_b = client.cookies["session"]
    jar.set("session", tok_b)
    client.cookies = jar

    r = await client.post(f"/api/groups/join/{code}")
    assert r.status_code == 200
    assert r.json()["member_count"] == 2

    r = await client.post("/api/groups/join/badcode")
    assert r.status_code == 404
