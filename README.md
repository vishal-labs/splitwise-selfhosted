# Self-Hosted Splitwise

Self-hostable Splitwise clone: FastAPI + SQLite (WAL) backend, React 19 + Vite frontend, nginx-served SPA.

## Features

- Groups with members, invite links/codes, and per-group base currency
- Invite people who haven't signed up yet (name + email) — they claim their place by registering with that email
- Expenses with equal / amounts / percent / shares splits (integer-cents math, no float drift), notes, receipts, comments
- Category auto-suggested from the description; deleted expenses can be undone (soft delete + restore)
- Multi-currency entry with daily ECB conversion rates
- Recurring expenses (weekly / monthly / yearly)
- Net balances with a per-group "simplify debts" switch (fewest transfers vs. person-to-person)
- Friends view: your balance with each person across every group
- Settle up in either direction ("I paid" / "I received"), UPI QR + deep links, payment proof uploads
- Settle-up reminders shared via the phone's share sheet / WhatsApp, with your UPI pay link
- Global activity feed, per-group totals (monthly trends, categories, your share), CSV export
- Mobile-first PWA UI (bottom tabs, sheets), desktop sidebar layout, light/dark/system theme
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
