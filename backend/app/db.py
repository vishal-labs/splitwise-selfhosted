from sqlalchemy import event, inspect
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


def _add_missing_columns(sync_conn) -> None:
    """Add columns the models gained but an existing table lacks.

    create_all only creates missing tables; it never alters existing ones, so a
    DB created before a column was added (e.g. users.upi_id) would break every
    query. Only nullable columns are auto-added — NOT NULL needs a default, which
    is a migration's job.
    """
    from app.models import Base

    insp = inspect(sync_conn)
    for table in Base.metadata.sorted_tables:
        if not insp.has_table(table.name):
            continue
        existing = {c["name"] for c in insp.get_columns(table.name)}
        for col in table.columns:
            if col.name in existing or not col.nullable:
                continue
            coltype = col.type.compile(sync_conn.dialect)
            sync_conn.exec_driver_sql(
                f'ALTER TABLE "{table.name}" ADD COLUMN "{col.name}" {coltype}'
            )


async def init() -> None:
    # ponytail: create_all + add-missing-columns instead of in-process alembic
    # (asyncio.run can't nest in lifespan); run `uv run alembic upgrade head`
    # manually for non-additive schema changes on existing DBs
    from app.models import Base
    from sqlalchemy import text

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_add_missing_columns)
        await conn.execute(text("PRAGMA journal_mode=WAL"))
