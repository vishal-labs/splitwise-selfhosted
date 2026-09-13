import datetime as dt
import xml.etree.ElementTree as ET

import httpx
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Rate

ECB_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml"

# ponytail: in-process cache; single-process app so no cross-worker invalidation needed
_cache: dict[tuple[str, str], tuple[dt.date, float]] = {}


async def _fetch_eur_rates() -> dict[str, float]:
    """Fetch ECB daily reference rates: {currency: units per EUR}."""
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(ECB_URL)
        r.raise_for_status()
    root = ET.fromstring(r.text)
    rates = {
        el.get("currency"): float(el.get("rate"))
        for el in root.iter()
        if el.tag.endswith("Cube") and el.get("currency") and el.get("rate")
    }
    rates["EUR"] = 1.0
    return rates


async def get_rate(db: AsyncSession, base: str, quote: str) -> float:
    """Rate for 1 base in quote minor units multiplier. Raises 503 if unavailable."""
    base, quote = base.upper(), quote.upper()
    if base == quote:
        return 1.0
    today = dt.date.today()
    key = (base, quote)
    hit = _cache.get(key)
    if hit and hit[0] == today:
        return hit[1]

    row = (
        await db.execute(select(Rate).where(Rate.base == base, Rate.quote == quote))
    ).scalar_one_or_none()
    if row and row.fetched_on == today:
        _cache[key] = (today, row.rate)
        return row.rate

    try:
        eur = await _fetch_eur_rates()
        rate = eur[quote] / eur[base]
    except Exception:
        if row:  # stale cache beats nothing
            return row.rate
        raise HTTPException(
            503, f"Exchange rate {base}->{quote} unavailable (offline?)"
        )

    db.merge(Rate(base=base, quote=quote, rate=rate, fetched_on=today))
    _cache[key] = (today, rate)
    return rate
