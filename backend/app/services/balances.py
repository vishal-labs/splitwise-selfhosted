"""Net balances and greedy simplified debts. All amounts in group base currency."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Expense, ExpenseSplit, Settlement

# expense rows: (payer_id, converted_amount_minor, [(user_id, amount_minor), ...])
# settlement rows: (payer_id, payee_id, amount_minor)


def net_balances(expenses: list, settlements: list) -> dict[int, int]:
    balances: dict[int, int] = {}
    for payer_id, amount, splits in expenses:
        balances[payer_id] = balances.get(payer_id, 0) + amount
        for user_id, amt in splits:
            balances[user_id] = balances.get(user_id, 0) - amt
    for payer_id, payee_id, amount in settlements:
        balances[payer_id] = balances.get(payer_id, 0) + amount
        balances[payee_id] = balances.get(payee_id, 0) - amount
    return balances


async def group_net_balances(db: AsyncSession, group_id: int) -> dict[int, int]:
    """Build expense + settlement rows from the DB, then net_balances."""
    exp_rows = []
    for e in (await db.scalars(select(Expense).where(Expense.group_id == group_id))).all():
        total = e.converted_amount_minor if e.converted_amount_minor is not None else e.amount_minor
        splits = (
            await db.scalars(select(ExpenseSplit).where(ExpenseSplit.expense_id == e.id))
        ).all()
        exp_rows.append((e.payer_id, total, [(s.user_id, s.amount_minor) for s in splits]))
    settle_rows = (
        await db.execute(
            select(Settlement.payer_id, Settlement.payee_id, Settlement.amount_minor)
            .where(Settlement.group_id == group_id)
        )
    ).all()
    return net_balances(exp_rows, settle_rows)


def simplify_debts(balances: dict[int, int]) -> list[tuple[int, int, int]]:
    """Greedy netting: [(from_id, to_id, amount)], amounts > 0, no self-loops."""
    debtors = sorted((u, -b) for u, b in balances.items() if b < 0)
    creditors = sorted((u, b) for u, b in balances.items() if b > 0)
    debts: list[tuple[int, int, int]] = []
    di = ci = 0
    while di < len(debtors) and ci < len(creditors):
        d_user, d_amt = debtors[di]
        c_user, c_amt = creditors[ci]
        pay = min(d_amt, c_amt)
        debts.append((d_user, c_user, pay))
        if d_amt == pay:
            di += 1
        else:
            debtors[di] = (d_user, d_amt - pay)
        if c_amt == pay:
            ci += 1
        else:
            creditors[ci] = (c_user, c_amt - pay)
    return debts
