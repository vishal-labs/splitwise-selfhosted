from app.services.balances import net_balances, simplify_debts


def test_net_balances_two_users():
    # A pays 10000 split equally, B pays 5000 split equally
    # A: +10000 - 5000(owed) - 2500(owed) = +2500
    # B: +5000 - 5000(owed) - 2500(owed) = -2500
    expenses = [
        (1, 10000, [(1, 5000), (2, 5000)]),
        (2, 5000, [(1, 2500), (2, 2500)]),
    ]
    balances = net_balances(expenses, settlements=[])
    assert balances == {1: 2500, 2: -2500}


def test_simplify_debts_properties():
    import random

    random.seed(42)
    for _ in range(50):
        n = random.randint(2, 6)
        # random balances that sum to zero
        raw = [random.randint(-5000, 5000) for _ in range(n)]
        raw[-1] = -sum(raw[:-1])
        balances = {i + 1: raw[i] for i in range(n)}
        debts = simplify_debts(balances)
        # no self-loops, all amounts > 0
        for frm, to, amt in debts:
            assert frm != to
            assert amt > 0
        # conservation: Σ debts == Σ credits
        assert sum(a for _, _, a in debts) == sum(-b for b in raw if b < 0)
        # each user's net effect matches input balance
        net: dict[int, int] = {}
        for frm, to, amt in debts:
            net[frm] = net.get(frm, 0) - amt
            net[to] = net.get(to, 0) + amt
        for uid, bal in balances.items():
            assert net.get(uid, 0) == bal, (balances, debts, uid)
        # zero-balance users never appear
        appearing = {u for f, t, _ in debts for u in (f, t)}
        assert all(balances[u] != 0 for u in appearing)


def test_simplify_debts_minimal_pair():
    # A owes B exactly 500 → single debt
    debts = simplify_debts({1: -500, 2: 500})
    assert debts == [(1, 2, 500)]


def test_zero_balance_excluded():
    debts = simplify_debts({1: 0, 2: -300, 3: 300})
    users = {u for f, t, _ in debts for u in (f, t)}
    assert 1 not in users
