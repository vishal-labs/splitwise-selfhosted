from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Activity


async def log_activity(
    db: AsyncSession, group_id: int, user_id: int, verb: str, target_id: int | None = None
) -> None:
    """Add an Activity row; caller commits."""
    db.add(
        Activity(group_id=group_id, user_id=user_id, verb=verb, target_id=target_id)
    )
