from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings

engine = create_async_engine(settings.database_url, connect_args={"check_same_thread": False})


@event.listens_for(engine.sync_engine, "connect")
def _set_sqlite_pragma(dbapi_con, _):
    cursor = dbapi_con.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def init() -> None:
    # ponytail: create_all instead of in-process alembic (asyncio.run can't nest in lifespan);
    # run `uv run alembic upgrade head` manually for schema changes on existing DBs
    from app.models import Base
    from sqlalchemy import text

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text("PRAGMA journal_mode=WAL"))
