import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db import SessionLocal, init
from app.routers import analytics, comments, expenses, friends, groups, settlements, uploads, users
from app.services.recurring import materialize_due

log = logging.getLogger(__name__)

RECURRING_INTERVAL_S = 600


async def _recurring_tick() -> None:
    """One materialize pass."""
    try:
        async with SessionLocal() as db:
            await materialize_due(db)
    except Exception:
        log.exception("recurring materialize failed")


async def _recurring_loop() -> None:
    while True:
        await asyncio.sleep(RECURRING_INTERVAL_S)
        await _recurring_tick()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init()
    await _recurring_tick()  # best-effort catch-up for sleeping containers
    task = asyncio.create_task(_recurring_loop())
    yield
    task.cancel()


def create_app() -> FastAPI:
    app = FastAPI(title="Self-Hosted Splitwise", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(users.router)
    app.include_router(groups.router)
    app.include_router(expenses.router)
    app.include_router(settlements.router)
    app.include_router(analytics.router)
    app.include_router(comments.router)
    app.include_router(uploads.router)
    app.include_router(friends.router)

    @app.get("/api/health")
    async def health():
        return {"status": "ok"}

    return app


app = create_app()
