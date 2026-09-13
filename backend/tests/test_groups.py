async def _register(client, email: str) -> str:
    """Register a user, return their session token."""
    r = await client.post(
        "/api/users/register",
        json={"email": email, "name": email, "password": "hunter2hunter"},
    )
    assert r.status_code == 200
    return r.cookies["session"]


async def _switch(client, token: str) -> None:
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
