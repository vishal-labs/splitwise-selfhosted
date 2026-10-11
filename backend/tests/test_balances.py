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


def test_pairwise_debts_keep_direct_relationships():
    from app.services.balances import pairwise_debts

    # 1 paid 1000 for 2; 2 paid 1000 for 3 → no rerouting, two direct debts
    expenses = [(1, 1000, [(2, 1000)]), (2, 1000, [(3, 1000)])]
    assert sorted(pairwise_debts(expenses, [])) == [(2, 1, 1000), (3, 2, 1000)]


def test_pairwise_debts_net_each_pair_and_apply_settlements():
    from app.services.balances import pairwise_debts

    expenses = [
        (1, 1000, [(1, 500), (2, 500)]),  # 2 owes 1: 500
        (2, 400, [(1, 400)]),  # 1 owes 2: 400 → net 2 owes 1: 100
    ]
    assert pairwise_debts(expenses, []) == [(2, 1, 100)]
    # 2 pays 1 150 → overshoots by 50 → 1 owes 2: 50
    assert pairwise_debts(expenses, [(2, 1, 150)]) == [(1, 2, 50)]
    assert pairwise_debts(expenses, [(2, 1, 100)]) == []


def test_pairwise_and_simplified_agree_on_net_balances():
    import random

    from app.services.balances import pairwise_debts

    rng = random.Random(7)
    for _ in range(200):
        users = list(range(1, rng.randint(3, 7)))  # 2..6 people
        expenses = []
        for _ in range(rng.randint(1, 8)):
            payer = rng.choice(users)
            members = rng.sample(users, rng.randint(1, len(users)))
            splits = [(u, rng.randint(1, 5000)) for u in members]
            expenses.append((payer, sum(a for _, a in splits), splits))
        settlements = [
            (a, b, rng.randint(1, 3000))
            for a, b in (rng.sample(users, 2) for _ in range(rng.randint(0, 3)))
        ]
        nets = net_balances(expenses, settlements)
        from_pairs: dict[int, int] = {}
        for f, t, amt in pairwise_debts(expenses, settlements):
            assert amt > 0 and f != t
            from_pairs[f] = from_pairs.get(f, 0) - amt
            from_pairs[t] = from_pairs.get(t, 0) + amt
        assert {u: b for u, b in from_pairs.items() if b} == {u: b for u, b in nets.items() if b}
