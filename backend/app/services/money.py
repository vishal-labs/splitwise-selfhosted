"""Integer minor-unit money math. Never floats for balances."""


def split_minor(total: int, n: int) -> list[int]:
    """Largest-remainder split of `total` cents into `n` parts, each within 1 cent."""
    if n <= 0:
        raise ValueError("n must be positive")
    if total < 0:
        raise ValueError("total must be non-negative")
    base, rem = divmod(total, n)
    return [base + 1] * rem + [base] * (n - rem)


def split_weighted(total: int, weights: list[int]) -> list[int]:
    """Proportional split by integer weights, largest-remainder, sums exactly to total."""
    if not weights or any(w < 0 for w in weights):
        raise ValueError("weights must be non-empty and non-negative")
    s = sum(weights)
    if s == 0:
        return split_minor(total, len(weights))
    raw = [total * w / s for w in weights]
    parts = [int(x) for x in raw]
    rem = total - sum(parts)
    # distribute leftover cents to largest fractional parts
    order = sorted(range(len(weights)), key=lambda i: raw[i] - parts[i], reverse=True)
    for i in order[:rem]:
        parts[i] += 1
    return parts


def convert(amount_minor: int, rate: float) -> int:
    """Convert minor units at `rate`, rounded to nearest cent."""
    return int(round(amount_minor * rate))
