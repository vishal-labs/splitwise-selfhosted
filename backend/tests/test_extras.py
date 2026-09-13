import os

import pytest

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def _upload_dir(tmp_path):
    # must be set before app.config is imported inside the client fixture
    os.environ["UPLOAD_DIR"] = str(tmp_path / "uploads")


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


async def _add_expense(client, group_id, payer_id, desc, amount, date, category=None):
    r = await client.post(
        f"/api/groups/{group_id}/expenses",
        json={
            "description": desc,
            "amount_minor": amount,
            "currency": "USD",
            "payer_id": payer_id,
            "date": date,
            "category": category,
            "splits": [{"user_id": payer_id, "mode": "equal", "value": None}],
        },
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


# --- analytics ---


async def test_analytics_monthly_and_category(client):
    group_id, a, b, _ = await _setup_group(client)
    await _add_expense(client, group_id, a, "Lunch", 1000, "2026-08-15", "Food")
    await _add_expense(client, group_id, a, "Dinner", 500, "2026-08-20", "Food")
    await _add_expense(client, group_id, a, "Taxi", 300, "2026-07-01", "Transport")

    r = await client.get(f"/api/groups/{group_id}/analytics?months=6")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["monthly"] == [
        {"month": "2026-07", "total": 300},
        {"month": "2026-08", "total": 1500},
    ]
    assert body["by_category"] == [
        {"category": "Food", "total": 1500},
        {"category": "Transport", "total": 300},
    ]


async def test_analytics_months_window(client):
    group_id, a, b, _ = await _setup_group(client)
    await _add_expense(client, group_id, a, "Old", 100, "2025-01-01", "Food")
    await _add_expense(client, group_id, a, "New", 200, "2026-08-01", "Food")

    r = await client.get(f"/api/groups/{group_id}/analytics?months=6")
    assert r.status_code == 200
    assert r.json()["monthly"] == [{"month": "2026-08", "total": 200}]


async def test_analytics_non_member_404(client):
    group_id, a, b, _ = await _setup_group(client)
    token_c = await _register(client, "c@b.com")
    await _switch(client, token_c)
    r = await client.get(f"/api/groups/{group_id}/analytics")
    assert r.status_code == 404


# --- CSV export ---


async def test_csv_export_header_and_rows(client):
    group_id, a, b, _ = await _setup_group(client)
    await _add_expense(client, group_id, a, "Lunch", 1000, "2026-08-15", "Food")

    r = await client.get(f"/api/groups/{group_id}/export.csv")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    lines = r.text.strip().splitlines()
    assert lines[0] == "date,description,category,payer,amount,currency,converted"
    assert lines[1] == "2026-08-15,Lunch,Food,a@b.com,1000,USD,1000"


async def test_csv_export_non_member_404(client):
    group_id, a, b, _ = await _setup_group(client)
    token_c = await _register(client, "c@b.com")
    await _switch(client, token_c)
    r = await client.get(f"/api/groups/{group_id}/export.csv")
    assert r.status_code == 404


# --- receipts ---


async def test_receipt_upload_and_serve_roundtrip(client):
    group_id, a, b, _ = await _setup_group(client)
    exp_id = await _add_expense(client, group_id, a, "Lunch", 1000, "2026-08-15")
    payload = b"\x89PNG fake image bytes"

    r = await client.post(
        f"/api/expenses/{exp_id}/receipt",
        files={"file": ("receipt.png", payload, "image/png")},
    )
    assert r.status_code == 200, r.text
    name = r.json()["receipt_path"]
    assert name.endswith(".png")

    r = await client.get(f"/api/expenses/{exp_id}/receipt")
    assert r.status_code == 200
    assert r.content == payload


async def test_receipt_wrong_type_rejected(client):
    group_id, a, b, _ = await _setup_group(client)
    exp_id = await _add_expense(client, group_id, a, "Lunch", 1000, "2026-08-15")
    r = await client.post(
        f"/api/expenses/{exp_id}/receipt",
        files={"file": ("evil.txt", b"nope", "text/plain")},
    )
    assert r.status_code == 422


async def test_receipt_too_large_413(client):
    group_id, a, b, _ = await _setup_group(client)
    exp_id = await _add_expense(client, group_id, a, "Lunch", 1000, "2026-08-15")
    r = await client.post(
        f"/api/expenses/{exp_id}/receipt",
        files={"file": ("big.png", b"x" * (5 * 1024 * 1024 + 1), "image/png")},
    )
    assert r.status_code == 413


async def test_receipt_non_member_404(client):
    group_id, a, b, _ = await _setup_group(client)
    exp_id = await _add_expense(client, group_id, a, "Lunch", 1000, "2026-08-15")
    token_c = await _register(client, "c@b.com")
    await _switch(client, token_c)
    r = await client.post(
        f"/api/expenses/{exp_id}/receipt",
        files={"file": ("r.png", b"x", "image/png")},
    )
    assert r.status_code == 404
    r = await client.get(f"/api/expenses/{exp_id}/receipt")
    assert r.status_code == 404


# --- comments ---


async def test_comments_post_list_delete(client):
    group_id, a, b, token_b = await _setup_group(client)
    exp_id = await _add_expense(client, group_id, a, "Lunch", 1000, "2026-08-15")

    r = await client.post(
        f"/api/expenses/{exp_id}/comments", json={"body": "who ordered the lobster?"}
    )
    assert r.status_code == 200, r.text
    comment = r.json()
    assert comment["body"] == "who ordered the lobster?"
    assert comment["user_id"] == a

    r = await client.get(f"/api/expenses/{exp_id}/comments")
    assert r.status_code == 200
    assert len(r.json()) == 1

    r = await client.delete(f"/api/expenses/{exp_id}/comments/{comment['id']}")
    assert r.status_code == 200
    r = await client.get(f"/api/expenses/{exp_id}/comments")
    assert r.json() == []


async def test_comments_non_member_404(client):
    group_id, a, b, _ = await _setup_group(client)
    exp_id = await _add_expense(client, group_id, a, "Lunch", 1000, "2026-08-15")
    token_c = await _register(client, "c@b.com")
    await _switch(client, token_c)
    r = await client.post(f"/api/expenses/{exp_id}/comments", json={"body": "hi"})
    assert r.status_code == 404
    r = await client.get(f"/api/expenses/{exp_id}/comments")
    assert r.status_code == 404


async def test_activity_endpoint(client):
    group_id, a, b, _ = await _setup_group(client)
    r = await client.get(f"/api/groups/{group_id}/activity")
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) >= 2  # created_group + joined
    assert rows[0]["user_name"]


async def test_rates_endpoint(client):
    await _register(client, "a@b.com")
    r = await client.get("/api/rates?base=USD")
    if r.status_code == 503:
        return  # offline test env
    assert r.status_code == 200
    body = r.json()
    assert body["base"] == "USD"
    assert body["rates"]["EUR"] > 0
