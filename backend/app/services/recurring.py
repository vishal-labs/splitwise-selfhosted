"""Recurring expense engine: advance rule dates and materialize due expenses."""

import calendar
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Expense, ExpenseSplit, RecurringRule


def advance(freq: str, day: int, current: date) -> date:
    """Next run date after `current` for a rule with day-of-month `day`."""
    if freq == "weekly":
        # ponytail: day (weekday) unused — +7d keeps the same weekday
        return date.fromordinal(current.toordinal() + 7)
    if freq == "monthly":
        y, m = (current.year + 1, 1) if current.month == 12 else (current.year, current.month + 1)
        return date(y, m, min(day, calendar.monthrange(y, m)[1]))
    if freq == "yearly":
        y = current.year + 1
        return date(y, current.month, min(day, calendar.monthrange(y, current.month)[1]))
    raise ValueError(f"unknown freq: {freq}")


async def materialize_due(db: AsyncSession) -> int:
    """Create one expense per due rule from its most recent generated expense.

    Returns count of expenses created. One run per rule per call — the 10-min
    scheduler catches up the rest.
    """
    today = date.today()
    rules = (
        await db.scalars(select(RecurringRule).where(RecurringRule.next_run <= today))
    ).all()
    created = 0
    for rule in rules:
        template = (
            await db.scalars(
                select(Expense)
                .where(Expense.recurring_rule_id == rule.id, Expense.deleted_at.is_(None))
                .order_by(Expense.date.desc(), Expense.id.desc())
                .limit(1)
            )
        ).first()
        if template is None:
            continue  # ponytail: no live template (just created, or every instance deleted) — skip
        expense = Expense(
            group_id=template.group_id,
            created_by=template.created_by,
            payer_id=template.payer_id,
            description=template.description,
            amount_minor=template.amount_minor,
            currency=template.currency,
            converted_amount_minor=template.converted_amount_minor,
            rate=template.rate,
            date=rule.next_run,
            category=template.category,
            recurring_rule_id=rule.id,
            receipt_path=template.receipt_path,
        )
        db.add(expense)
        await db.flush()
        for s in await db.scalars(
            select(ExpenseSplit).where(ExpenseSplit.expense_id == template.id)
        ):
            db.add(
                ExpenseSplit(expense_id=expense.id, user_id=s.user_id, amount_minor=s.amount_minor)
            )
        rule.next_run = advance(rule.freq, rule.day, rule.next_run)
        created += 1
    await db.commit()
    return created
