import os
import sys

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient


@pytest.fixture
def db_url(tmp_path):
    url = f"sqlite+aiosqlite:///{tmp_path}/test.db"
    os.environ["DATABASE_URL"] = url
    # ponytail: drop cached app modules so app.db's engine rebinds to this test's
    # tmp db — module-level engine would otherwise pin the first test's db
    for name in [n for n in sys.modules if n == "app" or n.startswith("app.")]:
        del sys.modules[name]
    return url


@pytest_asyncio.fixture
async def client(db_url):
    from app.db import engine
    from app.main import create_app

    app = create_app()
    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            yield c
    await engine.dispose()
