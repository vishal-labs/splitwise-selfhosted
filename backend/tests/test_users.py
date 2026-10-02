import os

import pytest

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def _upload_dir(tmp_path):
    # must be set before app.config is imported inside the client fixture
    os.environ["UPLOAD_DIR"] = str(tmp_path / "uploads")


async def _register(client, email: str) -> tuple[str, int]:
    client.cookies.clear()
    r = await client.post(
        "/api/users/register",
        json={"email": email, "name": email, "password": "hunter2hunter"},
    )
    assert r.status_code == 200
    return r.cookies["session"], r.json()["id"]


async def _switch(client, token: str) -> None:
    from httpx import Cookies

    jar = Cookies()
    jar.set("session", token)
    client.cookies = jar


async def _setup_group(client) -> tuple[int, int, int, str, str]:
    """Returns (group_id, a_id, b_id, token_a, token_b)."""
    token_a, a_id = await _register(client, "a@b.com")
    r = await client.post("/api/groups", json={"name": "Trip", "currency": "USD"})
    group_id = r.json()["id"]
    token_b, b_id = await _register(client, "b@b.com")
    await _switch(client, token_a)
    r = await client.post(f"/api/groups/{group_id}/members", json={"email": "b@b.com"})
    assert r.status_code == 200
    return group_id, a_id, b_id, token_a, token_b


# --- PATCH /users/me ---


async def test_patch_upi_id_sets_and_persists(client):
    await _register(client, "a@b.com")
    r = await client.patch("/api/users/me", json={"upi_id": "name@bank"})
    assert r.status_code == 200, r.text
    assert r.json()["upi_id"] == "name@bank"

    r = await client.get("/api/users/me")
    assert r.status_code == 200
    assert r.json()["upi_id"] == "name@bank"


async def test_patch_upi_id_null_clears(client):
    await _register(client, "a@b.com")
    r = await client.patch("/api/users/me", json={"upi_id": "9876543210@upi"})
    assert r.status_code == 200, r.text

    r = await client.patch("/api/users/me", json={"upi_id": None})
    assert r.status_code == 200, r.text
    assert r.json()["upi_id"] is None

    r = await client.get("/api/users/me")
    assert r.json()["upi_id"] is None


async def test_patch_invalid_upi_id_422(client):
    await _register(client, "a@b.com")
    r = await client.patch("/api/users/me", json={"upi_id": "not-a-vpa"})
    assert r.status_code == 422


async def test_patch_name_updates(client):
    await _register(client, "a@b.com")
    r = await client.patch("/api/users/me", json={"upi_id": "name@bank"})
    assert r.status_code == 200

    r = await client.patch("/api/users/me", json={"name": "Renamed"})
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "Renamed"
    assert r.json()["upi_id"] == "name@bank"  # absent upi_id is a no-op


# --- UPI QR upload / serve / delete ---


async def test_upi_qr_upload_and_get_roundtrip(client):
    _, user_id = await _register(client, "a@b.com")
    payload = b"\x89PNG fake qr bytes"

    r = await client.post(
        "/api/users/me/upi-qr",
        files={"file": ("qr.png", payload, "image/png")},
    )
    assert r.status_code == 200, r.text
    assert r.json() == {"has_upi_qr": True}

    r = await client.get("/api/users/me")
    assert r.json()["has_upi_qr"] is True

    r = await client.get(f"/api/users/{user_id}/upi-qr")
    assert r.status_code == 200
    assert r.content == payload


async def test_upi_qr_wrong_type_422(client):
    await _register(client, "a@b.com")
    r = await client.post(
        "/api/users/me/upi-qr",
        files={"file": ("evil.txt", b"nope", "text/plain")},
    )
    assert r.status_code == 422


async def test_upi_qr_delete_clears(client):
    _, user_id = await _register(client, "a@b.com")
    r = await client.post(
        "/api/users/me/upi-qr",
        files={"file": ("qr.png", b"bytes", "image/png")},
    )
    assert r.status_code == 200

    r = await client.delete("/api/users/me/upi-qr")
    assert r.status_code == 200
    assert r.json() == {"ok": True}

    r = await client.get("/api/users/me")
    assert r.json()["has_upi_qr"] is False
    r = await client.get(f"/api/users/{user_id}/upi-qr")
    assert r.status_code == 404


async def test_upi_qr_groupmate_can_fetch_nonmember_404(client):
    group_id, a_id, b_id, token_a, token_b = await _setup_group(client)
    payload = b"b qr bytes"

    await _switch(client, token_b)
    r = await client.post(
        "/api/users/me/upi-qr",
        files={"file": ("qr.png", payload, "image/png")},
    )
    assert r.status_code == 200

    r = await client.get(f"/api/users/{b_id}/upi-qr")
    assert r.status_code == 200
    assert r.content == payload

    await _switch(client, token_a)
    r = await client.get(f"/api/users/{b_id}/upi-qr")
    assert r.status_code == 200

    token_c, _ = await _register(client, "c@b.com")
    await _switch(client, token_c)
    r = await client.get(f"/api/users/{b_id}/upi-qr")
    assert r.status_code == 404


async def test_group_detail_exposes_upi(client):
    group_id, a_id, b_id, token_a, token_b = await _setup_group(client)
    await _switch(client, token_a)
    r = await client.patch("/api/users/me", json={"upi_id": "alice@bank"})
    assert r.status_code == 200

    await _switch(client, token_b)
    r = await client.post(
        "/api/users/me/upi-qr",
        files={"file": ("qr.png", b"bytes", "image/png")},
    )
    assert r.status_code == 200

    await _switch(client, token_a)
    r = await client.get(f"/api/groups/{group_id}")
    assert r.status_code == 200
    members = {m["email"]: m for m in r.json()["members"]}
    assert members["a@b.com"]["upi_id"] == "alice@bank"
    assert members["a@b.com"]["has_upi_qr"] is False
    assert members["b@b.com"]["has_upi_qr"] is True
