import os
import sqlite3
import sys

import pytest

pytestmark = pytest.mark.asyncio


def _reset_app_modules() -> None:
    # app.db builds its engine at import time, so drop cached modules to rebind
    for name in [n for n in sys.modules if n == "app" or n.startswith("app.")]:
        del sys.modules[name]


async def test_init_adds_columns_to_existing_db(tmp_path):
    """create_all never alters an existing table, so a DB created before a column
    was added (e.g. users.upi_id) must be patched on startup or every User query
    fails with 'no such column'."""
    db_file = tmp_path / "old.db"
    con = sqlite3.connect(db_file)
    con.execute(
        "CREATE TABLE users ("
        "id INTEGER PRIMARY KEY, email VARCHAR(255) NOT NULL, "
        "name VARCHAR(255) NOT NULL, password_hash VARCHAR(255) NOT NULL)"
    )
    con.commit()
    con.close()

    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{db_file}"
    _reset_app_modules()

    from app.db import engine, init

    await init()

    con = sqlite3.connect(db_file)
    cols = {row[1] for row in con.execute("PRAGMA table_info(users)")}
    con.close()
    await engine.dispose()

    assert {"upi_id", "upi_qr_path"} <= cols
