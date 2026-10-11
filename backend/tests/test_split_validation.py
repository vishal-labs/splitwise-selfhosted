"""#12 split value validation, #16 itemized split mode, #13 comment edit/delete."""

import pytest

from tests.test_features import _expense, _group, _switch


def _body(payer, splits, amount=1000, **extra):
    return {
        "description": "Bill",
        "amount_minor": amount,
        "currency": "USD",
        "payer_id": payer,
        "splits": splits,
        **extra,
    }


# --- #12: missing / fractional values are 422, never 500 or truncation ---


@pytest.mark.parametrize("mode", ["amounts", "percent", "itemized"])
async def test_missing_value_is_422_on_create_and_edit(client, mode):
    gid, ids, _ = await _group(client, "a@x.com", "b@x.com")
    a, b = ids["a@x.com"], ids["b@x.com"]
    splits = [{"user_id": a, "mode": mode}, {"user_id": b, "mode": mode, "value": 500}]
    r = await client.post(f"/api/groups/{gid}/expenses", json=_body(a, splits))
    assert r.status_code == 422, r.text

    e = await _expense(client, gid, a, [a, b], 1000)
    r = await client.patch(f"/api/expenses/{e['id']}", json=_body(a, splits))
    assert r.status_code == 422, r.text


async def test_fractional_amount_rejected_not_truncated(client):
    gid, ids, _ = await _group(client, "a@x.com", "b@x.com")
    a, b = ids["a@x.com"], ids["b@x.com"]
    splits = [
        {"user_id": a, "mode": "amounts", "value": 10.9},
        {"user_id": b, "mode": "amounts", "value": 0.1},
    ]
    r = await client.post(f"/api/groups/{gid}/expenses", json=_body(a, splits, amount=11))
    assert r.status_code == 422, r.text


@pytest.mark.parametrize("value", [0, -5, 100.5])
async def test_percent_out_of_range_rejected(client, value):
    gid, ids, _ = await _group(client, "a@x.com", "b@x.com")
    a, b = ids["a@x.com"], ids["b@x.com"]
    splits = [
        {"user_id": a, "mode": "percent", "value": value},
        {"user_id": b, "mode": "percent", "value": 100 - value},
    ]
    r = await client.post(f"/api/groups/{gid}/expenses", json=_body(a, splits))
    assert r.status_code == 422, r.text


async def test_amounts_client_payload_shape(client):
    """#17 regression: the UI sends amounts converted to minor units (600 → 60000)."""
    gid, ids, _ = await _group(client, "a@x.com", "b@x.com")
    a, b = ids["a@x.com"], ids["b@x.com"]
    typed = {a: "600", b: "400"}
    splits = [
        {"user_id": u, "mode": "amounts", "value": round(float(v) * 100)} for u, v in typed.items()
    ]
    r = await client.post(f"/api/groups/{gid}/expenses", json=_body(a, splits, amount=100000))
    assert r.status_code == 200, r.text
    assert {s["user_id"]: s["amount_minor"] for s in r.json()["splits"]} == {a: 60000, b: 40000}
    # a genuinely wrong sum is still rejected
    splits[1]["value"] = 30000
    r = await client.post(f"/api/groups/{gid}/expenses", json=_body(a, splits, amount=100000))
    assert r.status_code == 422


# --- #16: itemized = per-person items + shared extras split equally ---


async def test_itemized_spreads_tax_equally(client):
    gid, ids, _ = await _group(client, "a@x.com", "b@x.com", "c@x.com", "d@x.com")
    us = [ids[e] for e in ("a@x.com", "b@x.com", "c@x.com", "d@x.com")]
    items = [25000, 30000, 15000, 20000]  # ₹900 of food on a ₹1000 bill → ₹100 tax
    splits = [{"user_id": u, "mode": "itemized", "value": v} for u, v in zip(us, items)]
    r = await client.post(f"/api/groups/{gid}/expenses", json=_body(us[0], splits, amount=100000))
    assert r.status_code == 200, r.text
    got = {s["user_id"]: s["amount_minor"] for s in r.json()["splits"]}
    assert got == dict(zip(us, [27500, 32500, 17500, 22500]))
    assert sum(got.values()) == 100000


async def test_itemized_uneven_remainder_sums_exactly(client):
    gid, ids, _ = await _group(client, "a@x.com", "b@x.com", "c@x.com")
    us = [ids[e] for e in ("a@x.com", "b@x.com", "c@x.com")]
    splits = [{"user_id": u, "mode": "itemized", "value": 300} for u in us]
    r = await client.post(f"/api/groups/{gid}/expenses", json=_body(us[0], splits, amount=901))
    assert r.status_code == 200, r.text
    parts = sorted(s["amount_minor"] for s in r.json()["splits"])
    assert parts == [300, 300, 301]


async def test_itemized_items_over_total_rejected(client):
    gid, ids, _ = await _group(client, "a@x.com", "b@x.com")
    a, b = ids["a@x.com"], ids["b@x.com"]
    splits = [
        {"user_id": a, "mode": "itemized", "value": 700},
        {"user_id": b, "mode": "itemized", "value": 400},
    ]
    r = await client.post(f"/api/groups/{gid}/expenses", json=_body(a, splits, amount=1000))
    assert r.status_code == 422, r.text


async def test_itemized_zero_item_and_negative_rejected(client):
    gid, ids, _ = await _group(client, "a@x.com", "b@x.com")
    a, b = ids["a@x.com"], ids["b@x.com"]
    # someone who ordered nothing still shares the extras
    splits = [
        {"user_id": a, "mode": "itemized", "value": 800},
        {"user_id": b, "mode": "itemized", "value": 0},
    ]
    r = await client.post(f"/api/groups/{gid}/expenses", json=_body(a, splits, amount=1000))
    assert r.status_code == 200, r.text
    assert {s["user_id"]: s["amount_minor"] for s in r.json()["splits"]} == {a: 900, b: 100}
    splits[1]["value"] = -100
    r = await client.post(f"/api/groups/{gid}/expenses", json=_body(a, splits, amount=1000))
    assert r.status_code == 422


async def test_itemized_on_edit(client):
    gid, ids, _ = await _group(client, "a@x.com", "b@x.com")
    a, b = ids["a@x.com"], ids["b@x.com"]
    e = await _expense(client, gid, a, [a, b], 1000)
    splits = [
        {"user_id": a, "mode": "itemized", "value": 600},
        {"user_id": b, "mode": "itemized", "value": 200},
    ]
    r = await client.patch(f"/api/expenses/{e['id']}", json=_body(a, splits, amount=1000))
    assert r.status_code == 200, r.text
    assert {s["user_id"]: s["amount_minor"] for s in r.json()["splits"]} == {a: 700, b: 300}


# --- #13: comments can be edited and deleted by their author only ---


async def test_comment_edit_and_delete_author_only(client):
    gid, ids, tokens = await _group(client, "a@x.com", "b@x.com")
    a, b = ids["a@x.com"], ids["b@x.com"]
    e = await _expense(client, gid, a, [a, b], 1000)
    c = (await client.post(f"/api/expenses/{e['id']}/comments", json={"body": "first"})).json()
    assert c["updated_at"] is None

    r = await client.patch(f"/api/expenses/{e['id']}/comments/{c['id']}", json={"body": "fixed"})
    assert r.status_code == 200, r.text
    assert r.json()["body"] == "fixed"
    assert r.json()["updated_at"] is not None
    listed = (await client.get(f"/api/expenses/{e['id']}/comments")).json()
    assert [x["body"] for x in listed] == ["fixed"]

    r = await client.patch(f"/api/expenses/{e['id']}/comments/{c['id']}", json={"body": ""})
    assert r.status_code == 422

    await _switch(client, tokens["b@x.com"])
    r = await client.patch(f"/api/expenses/{e['id']}/comments/{c['id']}", json={"body": "hijack"})
    assert r.status_code == 403
    r = await client.delete(f"/api/expenses/{e['id']}/comments/{c['id']}")
    assert r.status_code == 403

    await _switch(client, tokens["a@x.com"])
    r = await client.delete(f"/api/expenses/{e['id']}/comments/{c['id']}")
    assert r.status_code == 200
    assert (await client.get(f"/api/expenses/{e['id']}/comments")).json() == []


async def test_comment_edit_wrong_expense_404(client):
    gid, ids, _ = await _group(client, "a@x.com", "b@x.com")
    a, b = ids["a@x.com"], ids["b@x.com"]
    e1 = await _expense(client, gid, a, [a, b], 1000)
    e2 = await _expense(client, gid, a, [a, b], 1000)
    c = (await client.post(f"/api/expenses/{e1['id']}/comments", json={"body": "hi"})).json()
    r = await client.patch(f"/api/expenses/{e2['id']}/comments/{c['id']}", json={"body": "x"})
    assert r.status_code == 404
