from app.services.money import convert, split_minor, split_weighted


def test_split_1001_by_3():
    assert split_minor(1001, 3) == [334, 334, 333]


def test_split_properties():
    for total in [0, 1, 7, 1000, 1001, 9999]:
        for n in range(1, 6):
            parts = split_minor(total, n)
            assert sum(parts) == total, (total, n, parts)
            assert all(p >= 0 for p in parts), (total, n, parts)
            assert max(parts) - min(parts) <= 1, (total, n, parts)


def test_convert_rounds():
    assert convert(1000, 1.05) == 1050
    assert convert(333, 0.3333) == 111  # 110.9889 → 111
    assert convert(0, 2.0) == 0


def test_split_weighted_shares():
    assert split_weighted(1000, [1, 1, 2]) == [250, 250, 500]
    # remainder goes to largest fractional part, sum always exact
    parts = split_weighted(1001, [1, 2])
    assert sum(parts) == 1001
    assert parts == [334, 667]  # fracs .667/.333 → rem 1 to index 0
