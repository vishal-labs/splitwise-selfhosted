"""Soft delete/restore, invited members, simplify toggle, notes, friends, global activity."""


async def _register(client, email: str, name: str | None = None) -> str:
    client.cookies.clear()
    r = await client.post(
        "/api/users/register",
        json={"email": email, "name": name or email, "password": "hunter2hunter"},
    )
    assert r.status_code == 200, r.text
    return r.cookies["session"]


async def _switch(client, token: str) -> None:
    from httpx import Cookies

    jar = Cookies()
    jar.set("session", token)
    client.cookies = jar


async def _group(client, *emails: str, currency: str = "USD"):
    """Creates a group owned by emails[0] with the rest joined. Returns (gid, ids, tokens)."""
    tokens = {e: await _register(client, e) for e in emails}
    await _switch(client, tokens[emails[0]])
    r = await client.post("/api/groups", json={"name": "Trip", "currency": currency})
    gid = r.json()["id"]
    for e in emails[1:]:
        r = await client.post(f"/api/groups/{gid}/members", json={"email": e})
        assert r.status_code == 200
    r = await client.get(f"/api/groups/{gid}")
    ids = {m["email"]: m["id"] for m in r.json()["members"]}
    return gid, ids, tokens


async def _expense(client, gid, payer, members, amount, desc="Dinner", **extra):
    r = await client.post(
        f"/api/groups/{gid}/expenses",
        json={
            "description": desc,
            "amount_minor": amount,
            "currency": "USD",
            "payer_id": payer,
            "splits": [{"user_id": u, "mode": "equal"} for u in members],
            **extra,
        },
    )
    assert r.status_code == 200, r.text
    return r.json()


# --- soft delete + restore ---


async def test_deleted_expense_hidden_and_restorable(client):
    gid, ids, _ = await _group(client, "a@x.com", "b@x.com")
    a, b = ids["a@x.com"], ids["b@x.com"]
    e = await _expense(client, gid, a, [a, b], 1000)

    r = await client.delete(f"/api/expenses/{e['id']}")
    assert r.status_code == 200
    assert (await client.get(f"/api/groups/{gid}/expenses")).json() == []
    assert (await client.get(f"/api/groups/{gid}/debts")).json() == []
    analytics = (await client.get(f"/api/groups/{gid}/analytics")).json()
    assert analytics["monthly"] == []
    csv_rows = (await client.get(f"/api/groups/{gid}/export.csv")).text.strip().splitlines()
    assert len(csv_rows) == 1  # header only

    r = await client.post(f"/api/expenses/{e['id']}/restore")
    assert r.status_code == 200, r.text
    assert [x["id"] for x in (await client.get(f"/api/groups/{gid}/expenses")).json()] == [e["id"]]
    debts = (await client.get(f"/api/groups/{gid}/debts")).json()
    assert debts == [{"from": b, "to": a, "amount": 500}]
    verbs = [x["verb"] for x in (await client.get(f"/api/groups/{gid}/activity")).json()]
    assert "expense_restored" in verbs


async def test_restore_requires_creator_or_admin(client):
    gid, ids, tokens = await _group(client, "a@x.com", "b@x.com")
    a, b = ids["a@x.com"], ids["b@x.com"]
    e = await _expense(client, gid, a, [a, b], 1000)
    await client.delete(f"/api/expenses/{e['id']}")
    await _switch(client, tokens["b@x.com"])
    r = await client.post(f"/api/expenses/{e['id']}/restore")
    assert r.status_code == 403


async def test_deleted_expense_cannot_be_edited(client):
    gid, ids, _ = await _group(client, "a@x.com", "b@x.com")
    a, b = ids["a@x.com"], ids["b@x.com"]
    e = await _expense(client, gid, a, [a, b], 1000)
    await client.delete(f"/api/expenses/{e['id']}")
    r = await client.patch(
        f"/api/expenses/{e['id']}",
        json={
            "description": "x",
            "amount_minor": 10,
            "currency": "USD",
            "payer_id": a,
            "splits": [{"user_id": a, "mode": "equal"}],
        },
    )
    assert r.status_code == 404


async def test_deleted_expense_does_not_block_leaving(client):
    gid, ids, tokens = await _group(client, "a@x.com", "b@x.com")
    a, b = ids["a@x.com"], ids["b@x.com"]
    e = await _expense(client, gid, a, [a, b], 1000)
    await client.delete(f"/api/expenses/{e['id']}")
    await _switch(client, tokens["b@x.com"])
    r = await client.delete(f"/api/groups/{gid}/members/{b}")
    assert r.status_code == 200, r.text


# --- notes ---


async def test_expense_notes_roundtrip(client):
    gid, ids, _ = await _group(client, "a@x.com", "b@x.com")
    a, b = ids["a@x.com"], ids["b@x.com"]
    e = await _expense(client, gid, a, [a, b], 1000, notes="Table 4, incl. tip")
    assert e["notes"] == "Table 4, incl. tip"
    listed = (await client.get(f"/api/groups/{gid}/expenses")).json()[0]
    assert listed["notes"] == "Table 4, incl. tip"
    assert listed["created_at"]


# --- invited (placeholder) members ---


async def test_invite_unregistered_member_by_name(client):
    gid, ids, _ = await _group(client, "a@x.com")
    r = await client.post(
        f"/api/groups/{gid}/members", json={"email": "new@x.com", "name": "Neha"}
    )
    assert r.status_code == 200, r.text
    members = (await client.get(f"/api/groups/{gid}")).json()["members"]
    neha = next(m for m in members if m["email"] == "new@x.com")
    assert neha["name"] == "Neha"
    assert neha["pending"] is True
    me = next(m for m in members if m["email"] == "a@x.com")
    assert me["pending"] is False

    # expenses can include the invited member right away
    a = ids["a@x.com"]
    await _expense(client, gid, a, [a, neha["id"]], 1000)
    debts = (await client.get(f"/api/groups/{gid}/debts")).json()
    assert debts == [{"from": neha["id"], "to": a, "amount": 500}]


async def test_invited_member_cannot_log_in(client):
    gid, _, _ = await _group(client, "a@x.com")
    await client.post(f"/api/groups/{gid}/members", json={"email": "new@x.com", "name": "Neha"})
    client.cookies.clear()
    r = await client.post("/api/users/login", json={"email": "new@x.com", "password": ""})
    assert r.status_code in (401, 422)
    r = await client.post("/api/users/login", json={"email": "new@x.com", "password": "anything123"})
    assert r.status_code == 401


async def test_registering_claims_invited_account(client):
    gid, ids, tokens = await _group(client, "a@x.com")
    a = ids["a@x.com"]
    await client.post(f"/api/groups/{gid}/members", json={"email": "new@x.com", "name": "Neha"})
    members = (await client.get(f"/api/groups/{gid}")).json()["members"]
    neha_id = next(m["id"] for m in members if m["email"] == "new@x.com")
    await _expense(client, gid, a, [a, neha_id], 1000)

    client.cookies.clear()
    r = await client.post(
        "/api/users/register",
        json={"email": "new@x.com", "name": "Neha K", "password": "hunter2hunter"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["id"] == neha_id
    # the claimed user sees the group and their debt
    groups = (await client.get("/api/groups")).json()
    assert [g["id"] for g in groups] == [gid]
    members = (await client.get(f"/api/groups/{gid}")).json()["members"]
    neha = next(m for m in members if m["id"] == neha_id)
    assert neha["pending"] is False
    assert neha["name"] == "Neha K"

    # a registered email still can't be registered twice
    client.cookies.clear()
    r = await client.post(
        "/api/users/register",
        json={"email": "new@x.com", "name": "Imposter", "password": "hunter2hunter"},
    )
    assert r.status_code == 409


async def test_unknown_email_without_name_still_404(client):
    gid, _, _ = await _group(client, "a@x.com")
    r = await client.post(f"/api/groups/{gid}/members", json={"email": "nobody@x.com"})
    assert r.status_code == 404


async def test_inviting_existing_user_by_name_just_adds_them(client):
    gid, _, tokens = await _group(client, "a@x.com")
    await _register(client, "b@x.com", "Bee")
    await _switch(client, tokens["a@x.com"])
    r = await client.post(f"/api/groups/{gid}/members", json={"email": "b@x.com", "name": "Other"})
    assert r.status_code == 200
    members = (await client.get(f"/api/groups/{gid}")).json()["members"]
    b = next(m for m in members if m["email"] == "b@x.com")
    assert b["name"] == "Bee"
    assert b["pending"] is False


# --- group settings: rename + simplify toggle ---


async def test_simplify_toggle_changes_debts(client):
    gid, ids, _ = await _group(client, "a@x.com", "b@x.com", "c@x.com")
    a, b, c = ids["a@x.com"], ids["b@x.com"], ids["c@x.com"]
    # b owes a 1000, c owes b 1000 → simplified: c pays a 1000 directly
    await _expense(client, gid, a, [b], 1000)
    await _expense(client, gid, b, [c], 1000)

    group = (await client.get(f"/api/groups/{gid}")).json()
    assert group["simplify_debts"] is True
    assert (await client.get(f"/api/groups/{gid}/debts")).json() == [
        {"from": c, "to": a, "amount": 1000}
    ]

    r = await client.patch(f"/api/groups/{gid}", json={"simplify_debts": False})
    assert r.status_code == 200, r.text
    assert r.json()["simplify_debts"] is False
    debts = (await client.get(f"/api/groups/{gid}/debts")).json()
    assert sorted((d["from"], d["to"], d["amount"]) for d in debts) == sorted(
        [(b, a, 1000), (c, b, 1000)]
    )


async def test_pairwise_debts_net_out_per_pair(client):
    gid, ids, _ = await _group(client, "a@x.com", "b@x.com")
    a, b = ids["a@x.com"], ids["b@x.com"]
    await client.patch(f"/api/groups/{gid}", json={"simplify_debts": False})
    await _expense(client, gid, a, [b], 1000)
    await _expense(client, gid, b, [a], 300)
    await client.post(
        f"/api/groups/{gid}/settlements",
        json={"payer_id": b, "payee_id": a, "amount_minor": 200, "currency": "USD"},
    )
    assert (await client.get(f"/api/groups/{gid}/debts")).json() == [
        {"from": b, "to": a, "amount": 500}
    ]


async def test_rename_group(client):
    gid, _, _ = await _group(client, "a@x.com")
    r = await client.patch(f"/api/groups/{gid}", json={"name": "Goa 2026"})
    assert r.status_code == 200
    assert (await client.get(f"/api/groups/{gid}")).json()["name"] == "Goa 2026"
    verbs = [x["verb"] for x in (await client.get(f"/api/groups/{gid}/activity")).json()]
    assert "group_updated" in verbs


async def test_group_settings_admin_only(client):
    gid, _, tokens = await _group(client, "a@x.com", "b@x.com")
    await _switch(client, tokens["b@x.com"])
    r = await client.patch(f"/api/groups/{gid}", json={"name": "Mine now"})
    assert r.status_code == 403


# --- friends (cross-group balances) ---


async def test_friends_aggregates_across_groups(client):
    gid, ids, tokens = await _group(client, "a@x.com", "b@x.com")
    a, b = ids["a@x.com"], ids["b@x.com"]
    await _expense(client, gid, a, [a, b], 1000)  # b owes a 500
    r = await client.post("/api/groups", json={"name": "Flat", "currency": "INR"})
    gid2 = r.json()["id"]
    await client.post(f"/api/groups/{gid2}/members", json={"email": "b@x.com"})
    r = await client.post(
        f"/api/groups/{gid2}/expenses",
        json={
            "description": "Rent",
            "amount_minor": 2000,
            "currency": "INR",
            "payer_id": b,
            "splits": [{"user_id": a, "mode": "equal"}, {"user_id": b, "mode": "equal"}],
        },
    )
    assert r.status_code == 200  # a owes b 1000 INR

    friends = (await client.get("/api/friends")).json()
    assert len(friends) == 1
    f = friends[0]
    assert f["id"] == b
    assert f["name"] == "b@x.com"
    assert sorted((x["currency"], x["amount"]) for x in f["balances"]) == [
        ("INR", -1000),
        ("USD", 500),
    ]
    assert sorted((x["group_id"], x["amount"]) for x in f["groups"]) == [
        (gid, 500),
        (gid2, -1000),
    ]

    await _switch(client, tokens["b@x.com"])
    friends_b = (await client.get("/api/friends")).json()
    assert sorted((x["currency"], x["amount"]) for x in friends_b[0]["balances"]) == [
        ("INR", 1000),
        ("USD", -500),
    ]


async def test_friends_lists_settled_people_with_empty_balances(client):
    gid, ids, _ = await _group(client, "a@x.com", "b@x.com")
    friends = (await client.get("/api/friends")).json()
    assert [(f["id"], f["balances"], f["groups"]) for f in friends] == [
        (ids["b@x.com"], [], [])
    ]


# --- global activity ---


async def test_global_activity_spans_groups_with_details(client):
    gid, ids, _ = await _group(client, "a@x.com", "b@x.com")
    a, b = ids["a@x.com"], ids["b@x.com"]
    await _expense(client, gid, a, [a, b], 1234, desc="Pizza")
    r = await client.post("/api/groups", json={"name": "Other", "currency": "USD"})
    gid2 = r.json()["id"]

    items = (await client.get("/api/activity")).json()
    assert {i["group_id"] for i in items} == {gid, gid2}
    added = next(i for i in items if i["verb"] == "expense_added")
    assert added["group_name"] == "Trip"
    assert added["detail"] == {"description": "Pizza", "amount": 1234, "currency": "USD"}
    assert items[0]["group_id"] == gid2  # newest first


async def test_global_activity_excludes_other_peoples_groups(client):
    await _group(client, "a@x.com")
    await _register(client, "z@x.com")
    assert (await client.get("/api/activity")).json() == []


# --- analytics summary ---


async def test_analytics_summary(client):
    gid, ids, _ = await _group(client, "a@x.com", "b@x.com")
    a, b = ids["a@x.com"], ids["b@x.com"]
    await _expense(client, gid, a, [a, b], 1000)
    await _expense(client, gid, b, [a, b], 600)
    s = (await client.get(f"/api/groups/{gid}/analytics")).json()["summary"]
    assert s == {"total": 1600, "you_paid": 1000, "your_share": 800}
