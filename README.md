# Self-Hosted Splitwise

Self-hostable Splitwise clone: FastAPI + SQLite (WAL) backend, React 19 + Vite frontend.

## Development

```sh
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

Frontend: `cd frontend && npm install && npm run dev` (proxies `/api` to :8000).

## Deployment

```sh
docker compose up -d
```

## Backup

Back up `backend/data/app.db` (SQLite, WAL mode) and `backend/data/uploads/`.
