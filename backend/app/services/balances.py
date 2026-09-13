"""Net balances and greedy simplified debts. All amounts in group base currency."""

# expense rows: (payer_id, converted_amount_minor, [(user_id, amount_minor), ...])
# settlement rows: (payer_id, payee_id, amount_minor)


def net_balances(expenses: list, settlements: list) -> dict[int, int]:
    balances: dict[int, int] = {}
    for payer_id, amount, splits in expenses:
        balances[payer_id] = balances.get(payer_id, 0) + amount
        for user_id, amt in splits:
            balances[user_id] = balances.get(user_id, 0) - amt
    for payer_id, payee_id, amount in settlements:
        balances[payer_id] = balances.get(payer_id, 0) - amount
        balances[payee_id] = balances.get(payee_id, 0) + amount
    return balances


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
