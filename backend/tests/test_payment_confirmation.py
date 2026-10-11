"""Payments stay pending (deletable) until the receiver confirms; confirmed = locked."""

from tests.test_features import _expense, _group, _switch


async def _pay(client, gid, payer, payee, amount=500):
    r = await client.post(
        f"/api/groups/{gid}/settlements",
        json={"payer_id": payer, "payee_id": payee, "amount_minor": amount, "currency": "USD"},
    )
    assert r.status_code == 200, r.text
    return r.json()


async def _setup(client):
    """a paid 1000 split with b → b owes a 500. Returns (gid, a, b, tokens)."""
    gid, ids, tokens = await _group(client, "a@x.com", "b@x.com", "c@x.com")
    a, b = ids["a@x.com"], ids["b@x.com"]
    await _expense(client, gid, a, [a, b], 1000)
    return gid, a, b, ids["c@x.com"], tokens


async def test_payment_recorded_by_payer_is_pending_but_counts(client):
    gid, a, b, _, tokens = await _setup(client)
    await _switch(client, tokens["b@x.com"])
    s = await _pay(client, gid, b, a)
    assert s["pending"] is True
    assert s["created_by"] == b
    assert s["confirmed_at"] is None
    # counts toward balances right away, as before
    assert (await client.get(f"/api/groups/{gid}/debts")).json() == []


async def test_payment_recorded_by_receiver_is_confirmed(client):
    gid, a, b, _, tokens = await _setup(client)
    s = await _pay(client, gid, b, a)  # a records "b paid me"
    assert s["pending"] is False
    assert s["confirmed_at"] is not None
    r = await client.delete(f"/api/settlements/{s['id']}")
    assert r.status_code == 409


async def test_pending_payment_can_be_deleted_and_balance_returns(client):
    gid, a, b, _, tokens = await _setup(client)
    await _switch(client, tokens["b@x.com"])
    s = await _pay(client, gid, b, a)
    r = await client.delete(f"/api/settlements/{s['id']}")
    assert r.status_code == 200, r.text
    assert (await client.get(f"/api/groups/{gid}/settlements")).json() == []
    assert (await client.get(f"/api/groups/{gid}/debts")).json() == [
        {"from": b, "to": a, "amount": 500}
    ]
    verbs = [x["verb"] for x in (await client.get(f"/api/groups/{gid}/activity")).json()]
    assert "settlement_deleted" in verbs
    # deleted twice → 404
    assert (await client.delete(f"/api/settlements/{s['id']}")).status_code == 404


async def test_receiver_can_decline_pending_payment(client):
    gid, a, b, _, tokens = await _setup(client)
    await _switch(client, tokens["b@x.com"])
    s = await _pay(client, gid, b, a)
    await _switch(client, tokens["a@x.com"])
    assert (await client.delete(f"/api/settlements/{s['id']}")).status_code == 200


async def test_only_receiver_confirms_and_then_it_is_locked(client):
    gid, a, b, c, tokens = await _setup(client)
    await _switch(client, tokens["b@x.com"])
    s = await _pay(client, gid, b, a)

    # payer and bystanders can't confirm
    assert (await client.post(f"/api/settlements/{s['id']}/confirm")).status_code == 403
    await _switch(client, tokens["c@x.com"])
    assert (await client.post(f"/api/settlements/{s['id']}/confirm")).status_code == 403

    await _switch(client, tokens["a@x.com"])
    r = await client.post(f"/api/settlements/{s['id']}/confirm")
    assert r.status_code == 200, r.text
    assert r.json()["pending"] is False
    assert r.json()["confirmed_at"] is not None
    # idempotent
    assert (await client.post(f"/api/settlements/{s['id']}/confirm")).status_code == 200

    # nobody can delete a confirmed payment
    for who in ("a@x.com", "b@x.com"):
        await _switch(client, tokens[who])
        assert (await client.delete(f"/api/settlements/{s['id']}")).status_code == 409
    verbs = [x["verb"] for x in (await client.get(f"/api/groups/{gid}/activity")).json()]
    assert "settlement_confirmed" in verbs


async def test_bystander_cannot_delete_pending_payment(client):
    gid, a, b, c, tokens = await _setup(client)
    await _switch(client, tokens["b@x.com"])
    s = await _pay(client, gid, b, a)
    await _switch(client, tokens["c@x.com"])
    assert (await client.delete(f"/api/settlements/{s['id']}")).status_code == 403


async def test_third_party_recorder_can_delete_while_pending(client):
    gid, a, b, c, tokens = await _setup(client)
    await _switch(client, tokens["c@x.com"])
    s = await _pay(client, gid, b, a)  # c records b→a on their behalf
    assert s["pending"] is True
    assert (await client.delete(f"/api/settlements/{s['id']}")).status_code == 200


async def test_non_member_gets_404(client):
    gid, a, b, _, tokens = await _setup(client)
    s = await _pay(client, gid, b, a)
    from tests.test_features import _register

    await _register(client, "z@x.com")
    assert (await client.post(f"/api/settlements/{s['id']}/confirm")).status_code == 404
    assert (await client.delete(f"/api/settlements/{s['id']}")).status_code == 404


async def test_pending_inbox_lists_payments_awaiting_me(client):
    gid, a, b, _, tokens = await _setup(client)
    await _switch(client, tokens["b@x.com"])
    s = await _pay(client, gid, b, a)
    assert (await client.get("/api/settlements/pending")).json() == []  # not b's to confirm
    await _switch(client, tokens["a@x.com"])
    inbox = (await client.get("/api/settlements/pending")).json()
    assert [(x["id"], x["group_name"], x["payer_name"]) for x in inbox] == [
        (s["id"], "Trip", "b@x.com")
    ]
    await client.post(f"/api/settlements/{s['id']}/confirm")
    assert (await client.get("/api/settlements/pending")).json() == []


async def test_legacy_settlements_are_treated_as_confirmed(client):
    """Rows from before this feature have pending = NULL: locked, not deletable."""
    gid, a, b, _, tokens = await _setup(client)
    s = await _pay(client, gid, b, a)
    from app.db import SessionLocal
    from app.models import Settlement

    async with SessionLocal() as db:
        row = await db.get(Settlement, s["id"])
        row.pending, row.created_by, row.confirmed_at = None, None, None
        await db.commit()
    listed = (await client.get(f"/api/groups/{gid}/settlements")).json()[0]
    assert listed["pending"] is False
    assert (await client.delete(f"/api/settlements/{s['id']}")).status_code == 409
