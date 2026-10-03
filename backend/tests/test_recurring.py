import datetime as dt

import pytest_asyncio


def _imports():
    from sqlalchemy import select
    from app.models import Expense, ExpenseSplit, RecurringRule
    from app.services.recurring import advance, materialize_due
    return select, Expense, ExpenseSplit, RecurringRule, advance, materialize_due


def _advance():
    from app.services.recurring import advance
    return advance


def _materialize_due():
    from app.services.recurring import materialize_due
    return materialize_due


@pytest_asyncio.fixture
async def db(client):
    from app.db import SessionLocal

    async with SessionLocal() as s:
        yield s


async def _setup_rule(client, db, *, freq: str, day: int, next_run: dt.date) -> tuple[int, int, int, int]:
    """Create group + equal-split expense, link rule to it. Returns (rule_id, group_id, a, b)."""
    client.cookies.clear()
    await client.post(
        "/api/users/register",
        json={"email": "a@b.com", "name": "a", "password": "hunter2hunter"},
    )
    r = await client.post("/api/groups", json={"name": "G", "currency": "USD"})
    group_id = r.json()["id"]
    await client.post(
        "/api/users/register",
        json={"email": "b@b.com", "name": "b", "password": "hunter2hunter"},
    )
    # switch back to a's cookie (register above replaced the session)
    client.cookies.clear()
    await client.post(
        "/api/users/login",
        json={"email": "a@b.com", "password": "hunter2hunter"},
    )
    r = await client.post(f"/api/groups/{group_id}/members", json={"email": "b@b.com"})
    assert r.status_code == 200, r.text
    r = await client.get(f"/api/groups/{group_id}")
    members = {m["email"]: m["id"] for m in r.json()["members"]}
    a, b = members["a@b.com"], members["b@b.com"]

    r = await client.post(
        f"/api/groups/{group_id}/expenses",
        json={
            "description": "Rent",
            "amount_minor": 1000,
            "currency": "USD",
            "payer_id": a,
            "category": "housing",
            "splits": [
                {"user_id": a, "mode": "equal", "value": None},
                {"user_id": b, "mode": "equal", "value": None},
            ],
        },
    )
    assert r.status_code == 200, r.text
    expense_id = r.json()["id"]

    from app.models import Expense, RecurringRule
    rule = RecurringRule(group_id=group_id, freq=freq, day=day, next_run=next_run)
    db.add(rule)
    await db.flush()
    expense = await db.get(Expense, expense_id)
    expense.recurring_rule_id = rule.id
    await db.commit()
    return rule.id, group_id, a, b


# --- advance ---


def test_advance_monthly_clamps_day():
    advance = _advance()
    assert advance("monthly", 31, dt.date(2026, 1, 31)) == dt.date(2026, 2, 28)
    assert advance("monthly", 15, dt.date(2026, 1, 15)) == dt.date(2026, 2, 15)
    assert advance("monthly", 31, dt.date(2026, 12, 31)) == dt.date(2027, 1, 31)


def test_advance_weekly():
    advance = _advance()
    assert advance("weekly", 1, dt.date(2026, 1, 1)) == dt.date(2026, 1, 8)


def test_advance_yearly_clamps_feb29():
    advance = _advance()
    assert advance("yearly", 29, dt.date(2024, 2, 29)) == dt.date(2025, 2, 28)
    assert advance("yearly", 10, dt.date(2026, 3, 10)) == dt.date(2027, 3, 10)


# --- materialize_due ---


async def test_materialize_due_creates_expense(client, db):
    rule_id, _, a, b = await _setup_rule(
        client, db, freq="monthly", day=31, next_run=dt.date(2026, 9, 1)  # past (today: 2026-09-13)
    )
    materialize_due = _materialize_due()
    created = await materialize_due(db)
    assert created == 1

    from sqlalchemy import select
    from app.models import Expense, ExpenseSplit, RecurringRule
    expense = (
        await db.scalars(
            select(Expense).where(Expense.recurring_rule_id == rule_id).order_by(Expense.id.desc())
        )
    ).first()
    assert expense is not None
    assert expense.payer_id == a
    assert expense.description == "Rent"
    assert expense.amount_minor == 1000
    assert expense.date == dt.date(2026, 9, 1)
    splits = {
        s.user_id: s.amount_minor
        for s in await db.scalars(select(ExpenseSplit).where(ExpenseSplit.expense_id == expense.id))
    }
    assert splits == {a: 500, b: 500}

    rule = await db.get(RecurringRule, rule_id)
    assert rule.next_run == dt.date(2026, 10, 31)  # day=31, Oct has 31 days


async def test_materialize_due_future_rule_skipped(client, db):
    # Derive the date from today so this stays in the future as the clock advances;
    # a hardcoded date silently becomes past and materializes the rule.
    future = dt.date.today() + dt.timedelta(days=30)
    rule_id, _, _, _ = await _setup_rule(
        client, db, freq="monthly", day=15, next_run=future
    )
    materialize_due = _materialize_due()
    assert await materialize_due(db) == 0
    from app.models import RecurringRule
    rule = await db.get(RecurringRule, rule_id)
    assert rule.next_run == future
    from sqlalchemy import select
    from app.models import Expense
    expenses = (
        await db.scalars(select(Expense).where(Expense.recurring_rule_id == rule_id))
    ).all()
    assert len(expenses) == 1  # only the original


# --- cancel rule ---


async def test_cancel_recurring_rule(client, db):
    from sqlalchemy import select

    from app.models import RecurringRule

    rule_id, group_id, _, _ = await _setup_rule(
        client, db, freq="monthly", day=15, next_run=dt.date(2026, 10, 1)
    )

    # non-member → 404
    client.cookies.clear()
    await client.post(
        "/api/users/register",
        json={"email": "c@b.com", "name": "c", "password": "hunter2hunter"},
    )
    r = await client.delete(f"/api/groups/{group_id}/recurring/{rule_id}")
    assert r.status_code == 404

    # member cancels → 200; rule gone so materialization stops
    client.cookies.clear()
    await client.post("/api/users/login", json={"email": "a@b.com", "password": "hunter2hunter"})
    r = await client.delete(f"/api/groups/{group_id}/recurring/{rule_id}")
    assert r.status_code == 200
    rule = await db.get(RecurringRule, rule_id)
    assert rule is None

    # second delete → 404
    r = await client.delete(f"/api/groups/{group_id}/recurring/{rule_id}")
    assert r.status_code == 404


async def test_cancel_rule_from_other_group_404(client, db):
    from sqlalchemy import select

    from app.models import RecurringRule

    rule_id, group_id, a, _ = await _setup_rule(
        client, db, freq="monthly", day=15, next_run=dt.date(2026, 10, 1)
    )
    r = await client.post("/api/groups", json={"name": "Other", "currency": "USD"})
    other_id = r.json()["id"]
    r = await client.delete(f"/api/groups/{other_id}/recurring/{rule_id}")
    assert r.status_code == 404
    assert await db.get(RecurringRule, rule_id) is not None
