# Self-Hosted Splitwise

Self-hostable Splitwise clone: FastAPI + SQLite (WAL) backend, React 19 + Vite frontend, nginx-served SPA.

## Features

- Groups with members, invite codes, and per-group base currency
- Expenses with equal / amounts / percent / shares splits (integer-cents math, no float drift)
- Multi-currency entry with daily ECB conversion rates
- Recurring expenses (weekly / monthly / yearly)
- Net balances + simplified debts ("settle up" suggestions)
- Analytics (monthly trends, category breakdown), CSV export
- Receipt attachments, expense comments, activity feed
- Cookie-session auth (argon2 password hashing)

## Quickstart

```sh
docker compose up --build
```

Open http://localhost:8080, register, create a group, invite members by email.

## Development

```sh
cd backend
uv sync
uv run uvicorn app.main:app --reload

cd ../frontend
npm install
npm run dev   # proxies /api to localhost:8000
```

## Tests

```sh
cd backend && uv run pytest
```

## Environment variables

| Var | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `sqlite+aiosqlite:///./data/app.db` | SQLite (WAL). In Docker set to `sqlite+aiosqlite:////data/app.db` |
| `UPLOAD_DIR` | `./data/uploads` | Receipt storage |
| `SESSION_TTL_DAYS` | `30` | Session cookie lifetime |

## Admin CLI

Run inside the api container:

```sh
# Reset a user's password (prompts twice, no echo)
docker compose exec api uv run python -m app.cli reset-password user@example.com

# List all users
docker compose exec api uv run python -m app.cli list-users
```

## Backup

All state lives in the named volume `data` (SQLite DB + receipts):

```sh
docker run --rm -v selfdeployed-splitwise_data:/data -v "$PWD":/backup alpine \
  tar czf /backup/splitwise-backup.tgz -C /data .
```

Restore by reversing the tar into the volume.
