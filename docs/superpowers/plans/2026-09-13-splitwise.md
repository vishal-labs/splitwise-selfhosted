# Self-Hosted Splitwise Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A self-hostable Splitwise clone (FastAPI + React) with premium-gated features unlocked: recurring expenses, multi-currency, simplified debts, analytics, CSV export, receipt attachments, activity feed.

**Architecture:** FastAPI monolith on SQLite (WAL) with cookie-session auth. React 19 + Vite SPA served by nginx, proxying `/api` to uvicorn. Docker-compose deployment. Money handled exclusively as integer minor units (cents) — never floats.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2 (async, aiosqlite), Alembic, pytest + httpx; React 19, Vite, TypeScript, TanStack Query, Tailwind v4, react-router, Recharts.

**Stack freshness:** Before writing code, each engineer fetches current framework docs via context7 (FastAPI, SQLAlchemy 2 async, React 19, Tailwind v4) — training data is stale for Tailwind v4 and React 19.

**Design skills:** Frontend subagents MUST read `.opencode/skills/ui-ux-pro-max/SKILL.md` (palette/typography selection) and `~/.config/opencode/skills/modern-web-guidance-repo/skills/modern-web-guidance/SKILL.md` (native `<dialog>`, popover API, anchor positioning, view transitions — no component libraries for these primitives).

---

## File Structure

```
docker-compose.yml
README.md
backend/
  pyproject.toml              # uv-managed; fastapi, sqlalchemy[asyncio], aiosqlite, alembic, pydantic-settings, httpx, python-multipart, argon2-cffi
  alembic.ini
  alembic/versions/
  app/
    main.py                   # app factory, lifespan (recurring scheduler loop), static mount
    config.py                 # pydantic-settings: DATABASE_URL, SESSION_TTL, BASE_CURRENCY, UPLOAD_DIR
    db.py                     # async engine, session factory, init()
    models.py                 # all SQLAlchemy models (single file — small schema)
    schemas.py                # pydantic request/response models
    auth.py                   # session cookie create/verify + dependencies
    routers/
      users.py                # register, login, logout, me
      groups.py               # groups CRUD, memberships
      expenses.py             # expenses CRUD, splits, comments, recurring
      settlements.py          # record payment, simplified debts
      analytics.py            # group/category breakdowns, CSV export
      uploads.py              # receipt attach/serve
    services/
      money.py                # int cents math, currency conversion at entry
      balances.py             # net balances + greedy simplified debts
      recurring.py            # materialize due recurring expenses
      rates.py                # daily ECB rates fetch+cache
    activity.py               # activity log helper
  tests/
    conftest.py
    test_auth.py test_groups.py test_expenses.py test_balances.py
    test_settlements.py test_recurring.py test_extras.py
frontend/
  package.json                # vite, react, @tanstack/react-query, react-router, recharts, tailwindcss v4
  src/
    main.tsx  App.tsx
    api.ts                    # fetch wrapper + query hooks
    tokens.css                # design tokens from ui-ux-pro-max (CSS custom properties, oklch)
    components/               # Button, Dialog (native), Input, Avatar, Tabs, Sheet, EmptyState
    pages/
      Login.tsx Register.tsx
      Dashboard.tsx           # groups list, net balance summary
      GroupDetail.tsx         # expenses, balances, settle, members
      AddExpense.tsx          # sheet: payer, splits (equal/amounts/percent/shares), currency, receipt, recurring
      Analytics.tsx           # charts, monthly trends
      Activity.tsx
      Settings.tsx            # profile, export CSV
```

**Money rule (all tasks):** amounts are integer minor units (`amount_minor: int`, e.g. cents). Expense stores `currency` (entry), `amount_minor`, optional `converted_amount_minor` in group base currency + `rate`. All balance math in base currency.

## API Contract

- `POST /api/users/register {email,name,password}` → sets session cookie
- `POST /api/users/login {email,password}` / `POST /api/users/logout` / `GET /api/users/me`
- `GET/POST /api/groups`, `GET /api/groups/{id}` (detail w/ balances), `POST /api/groups/{id}/members {email_or_id}`, `DELETE /api/groups/{id}/members/{user_id}`
- `GET /api/groups/{id}/expenses`, `POST /api/groups/{id}/expenses` `{description,amount_minor,currency,payer_id,splits:[{user_id,mode,value}],recurring?:{freq:"monthly"|"weekly"|"yearly",day},receipt?:multipart}` , `PATCH/DELETE /api/expenses/{id}`
- `POST /api/groups/{id}/settlements {payer_id,payee_id,amount_minor}`
- `GET /api/groups/{id}/debts` → simplified debts (greedy netting)
- `GET /api/groups/{id}/activity`, `POST /api/expenses/{id}/comments {body}`
- `GET /api/groups/{id}/analytics?months=6`, `GET /api/groups/{id}/export.csv`
- `GET /api/rates?base=USD` (cached ECB daily rates)
- Auth: HttpOnly SameSite=Lax session cookie (random token, hashed in `sessions` table). Ownership checks: only group members can read; expense creator or group admin can edit/delete.

## Schema (models.py)

`User(id,email unique,name,password_hash)` · `Session(token_hash,user_id,expires_at)` · `Group(id,name,currency,created_by,invite_code unique)` · `membership(group_id,user_id,role)` · `Expense(id,group_id,created_by,payer_id,description,amount_minor,currency,converted_amount_minor,rate,date,category,recurring_rule_id,receipt_path)` · `ExpenseSplit(expense_id,user_id,amount_minor)` · `Settlement(id,group_id,payer_id,payee_id,amount_minor,currency,rate,date)` · `Comment(expense_id,user_id,body)` · `RecurringRule(id,group_id,freq,day,next_run)` · `Activity(group_id,user_id,verb,target_id,created_at)` · `Rate(base,quote,rate,fetched_on)`

---

### Task 1: Backend scaffold

**Files:** Create `backend/pyproject.toml`, `backend/app/{main,config,db,models}.py`, `backend/alembic.ini`, `backend/alembic/versions/0001_initial.py`, `backend/tests/conftest.py`, `docker-compose.yml`, `README.md`, `backend/.env.example`

- [ ] uv init backend, add deps (fetch current versions via context7)
- [ ] `db.py`: async engine (aiosqlite, WAL via PRAGMA), `models.py`: full schema above
- [ ] `main.py`: factory app with `/api` prefix, CORS for localhost:5173, lifespan creates tables + runs alembic
- [ ] `conftest.py`: pytest-asyncio app client with tmp sqlite db
- [ ] Run `pytest` (empty collect ok), `uvicorn app.main:app` boots
- [ ] Commit

### Task 2: Auth (users + sessions)

**Files:** Create `backend/app/auth.py`, `backend/app/routers/users.py`, `backend/app/schemas.py` (user schemas), `backend/tests/test_auth.py`, Modify `backend/app/main.py` (include router)

- [ ] Test first: register → me returns user; login wrong password → 401; logout clears cookie
- [ ] `argon2-cffi` hash; session = `secrets.token_urlsafe(32)`, store SHA-256 hash, TTL 30d
- [ ] `get_current_user` FastAPI dependency
- [ ] Tests pass → commit

### Task 3: Groups + memberships — depends on Task 2

**Files:** Create `backend/app/routers/groups.py`, `backend/tests/test_groups.py`, Modify `main.py`, `schemas.py`

- [ ] Test first: create group, list own groups, add member by email, non-member gets 403/404
- [ ] Membership dependency `get_group_member(group_id)`; invite_code = 6-char token; activity log on join/leave
- [ ] Tests pass → commit

### Task 4: Expenses + splits + balances — depends on Task 3 (core money logic; the one non-trivial algorithm)

**Files:** Create `backend/app/routers/expenses.py`, `backend/app/services/{money,balances}.py`, `backend/tests/{test_expenses,test_balances}.py`, Modify `main.py`

- [ ] Test first: equal split of 1001 cents → [334,334,333], remainder to payer; percent splits sum 100 validated; amount-mode validated against total
- [ ] `money.py`: `split_minor(total, n) -> list[int]` (largest-remainder), `convert(amount_minor, rate)` → int, rate from `rates.py` (ECB daily, cached in-process + `Rate` table)
- [ ] `balances.py`: `net_balances(group) -> {user_id: int}` = Σ(paid) − Σ(owed) − settlements, all in base currency; `simplify_debts(balances) -> [(from,to,amount)]` greedy: match min(creditor,debtor) pairs
- [ ] `simplify_debts` property test: sum of debtor amounts == sum of creditor amounts, no self-loops, amounts > 0
- [ ] Expense create: validate splits total == amount_minor (equal mode exempt), payer must be member; store converted amount using entry-date rate; activity log
- [ ] Tests pass → commit

### Task 5: Settlements — depends on Task 4

**Files:** Create `backend/app/routers/settlements.py`, `backend/tests/test_settlements.py`, Modify `main.py`

- [ ] Test first: settlement reduces payer's debt in balances; can't settle with non-member
- [ ] Same conversion + activity pattern as expenses
- [ ] Tests pass → commit

### Task 6: Recurring expenses — depends on Task 4

**Files:** Create `backend/app/services/recurring.py`, `backend/app/routers/expenses.py` additions, `backend/tests/test_recurring.py`, Modify `main.py` lifespan

- [ ] Test first: rule with `next_run` in past materializes expense with correct `next_run` advance (monthly = add month, clamp day>28, weekly +7d, yearly +1y)
- [ ] Lifespan loop: every 10 min call `materialize_due()`; also lazily on group GET (covers sleeping containers)
- [ ] Tests pass → commit

### Task 7: Extras — analytics, CSV export, receipts, comments — depends on Task 4

**Files:** Create `backend/app/routers/{analytics,uploads}.py`, `backend/tests/test_extras.py`, Modify `main.py`

- [ ] Analytics: per-category totals + per-month totals (last N months) from converted amounts; simple SQL group-bys
- [ ] CSV: string IO, headers `date,description,category,payer,amount,currency,converted`, streamed response
- [ ] Receipts: `python-multipart` upload to `UPLOAD_DIR` (uuid filename, whitelist png/jpg/webp/pdf, 5MB cap), served via static route behind member check
- [ ] Comments: trivial CRUD + activity
- [ ] Tests pass → commit

### Task 8: Frontend scaffold + design system — parallel with Tasks 2–7

**Files:** Create `frontend/` per structure above; `src/tokens.css`, `src/components/*`, `src/api.ts`

- [ ] Vite react-ts template; install deps (context7 for current react-router + Tailwind v4 setup)
- [ ] Read ui-ux-pro-max: pick palette + font pairing (finance-app profile, oklch tokens in `tokens.css`, dark-mode via `prefers-color-scheme` + toggle)
- [ ] Read modern-web-guidance: use native `<dialog>` for modals, popover API for menus, CSS scroll-driven anims sparingly; no MUI/Ant
- [ ] Components: Button, Input, Avatar, Tabs, Dialog, Sheet (slide-over dialog), EmptyState — minimal props, no variants API beyond needed
- [ ] `api.ts`: fetch wrapper w/ credentials:include, typed routes; TanStack Query client
- [ ] Commit

### Task 9: Auth pages + app shell — depends on Task 8

**Files:** Create `frontend/src/pages/{Login,Register}.tsx`, Modify `App.tsx` (router + protected route redirect)

- [ ] Login/register forms (native validation, `:user-invalid` styling), session check via `GET /api/users/me`
- [ ] Shell: top bar with avatar menu (popover), bottom nav on mobile
- [ ] Commit

### Task 10: Dashboard + group detail — depends on Tasks 5–9 (needs balances/settle API)

**Files:** Create `frontend/src/pages/{Dashboard,GroupDetail}.tsx`, Modify `api.ts`

- [ ] Dashboard: group cards w/ your net balance (green/red), total owed summary; create-group dialog
- [ ] Group detail: expense list grouped by date, member balances tab, simplified-debts view ("settle up" suggestions), invite link, leave group
- [ ] Commit

### Task 11: Add expense + settle up flows — depends on Task 10

**Files:** Create `frontend/src/pages/AddExpense.tsx`, Modify `GroupDetail.tsx`

- [ ] Sheet flow: amount, description, category chips, payer select, split mode tabs (equal/amounts/percent/shares) with live validation vs total, currency picker (from `/api/rates`), receipt upload, "repeat monthly" toggle
- [ ] Settle-up: pick payer/payee/amount, prefilled from simplified debts
- [ ] Optimistic queries invalidation
- [ ] Commit

### Task 12: Analytics, activity, settings — depends on Task 10

**Files:** Create `frontend/src/pages/{Analytics,Activity,Settings}.tsx`

- [ ] Analytics: Recharts — monthly spend bar + category donut, per-member balances over time
- [ ] Activity feed (paginated), Settings: profile edit, CSV export download, dark mode toggle
- [ ] Commit

### Task 13: Deployment + e2e verification — depends on all

**Files:** Modify `docker-compose.yml`, `README.md`, `backend/app/main.py`

- [ ] compose: `api` (uvicorn, volume for sqlite+uploads), `web` (nginx: built SPA + `/api` proxy), healthchecks, restart policies
- [ ] `docker compose up`, register → create group → add expense → settle → analytics via webapp-testing skill screenshots
- [ ] README: setup, env vars, backup note (sqlite file + uploads dir)
- [ ] Final commit
