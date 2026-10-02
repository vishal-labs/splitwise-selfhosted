# Contributing

Preferences and conventions for working on this repo (self-hosted Splitwise: FastAPI + React SPA, SQLite, docker-compose).

## Workflow

- Build with the minimum diff that works. No speculative abstractions, no interfaces with one implementation, no deps for what a few lines do. Deliberate shortcuts get a `ponytail:` comment naming the ceiling and upgrade path.
- TDD on backend logic: write the failing test first (pytest + httpx against the app factory), then implement, then commit. Money logic and balance math always get property-style tests.
- Verify UI changes with Playwright screenshots (mobile-first: 390×844 and 412×915, plus 1280×900 desktop to catch regressions) before claiming done.
- Frequent, small, conventional commits (`feat:`, `fix:`, `style:`, `chore:`, `docs:`). Never auto-commit beyond what was asked.
- Frontend/backend work runs as parallel subagents with strict file partitions when trees don't overlap.

## Stack rules

- Backend: Python 3.14, FastAPI, uv-managed deps, SQLAlchemy 2 async + aiosqlite, Alembic available but `create_all` on startup (run `alembic upgrade head` manually for schema changes on existing DBs).
- **Money is integer minor units (`amount_minor`) end to end. Never floats.** Largest-remainder splitting, rates stored at expense creation time.
- Auth: cookie sessions (token_urlsafe, SHA-256 hashed, 30d TTL, HttpOnly SameSite=Lax). argon2 password hashing.
- Frontend: React 19 + Vite + TS, TanStack Query, react-router, Tailwind v4, Recharts. No MUI/Ant/Radix — the web platform is the component library: native `<dialog>`, popover API, `appearance: base-select` menus, `@starting-style` animations.
- Design tokens: oklch CSS custom properties in `src/tokens.css` (amber primary, slate navy, light+dark via `prefers-color-scheme`). Fonts: IBM Plex Sans. No new palette or component-library additions.

## UI conventions (established, keep consistent)

- Borderless "hero" inputs: big amount field with inline borderless selects beside it; per-member split inputs are borderless with a bottom border, right-aligned tabular numbers, unit label beside.
- Pill segmented controls for mode/tab switching (centered, fit-content).
- Member pickers are toggle chips with distinct per-user avatar colors (name-hash → `--avatar-1..6`).
- All dialogs are bottom sheets on mobile (≤40rem), centered cards on desktop, with `env(safe-area-inset-bottom)` padding.
- Every small dialog/menu uses the shared `menu-select` / `dialog-sheet` / chip classes from `src/index.css` — extend those, don't inline ad-hoc styles.
- Mobile touch targets ≥44px; buttons never wrap labels (`whitespace-nowrap`).
- Icons come from `src/components/icons.tsx` (inline SVG, currentColor) — never text glyphs or emoji in action buttons.

## Gotchas (don't re-learn these)

- TanStack Query keys use the route param's string type — invalidate with `String(groupId)`, or nothing refetches.
- In-form buttons must have `type="button"` or clicking them submits the form.
- React `defaultValue` only applies at mount — use controlled `value` when option data loads async.
- Unit-of-work ordering: delete child rows (splits, comments) with core `delete()` statements before deleting parents; no relationships defined between them.
- Test cookie jars: register/login Set-Cookie accumulates in one httpx client — replace the jar (`client.cookies = fresh`) when switching users.
- `date` as both field name and type import collides in pydantic models — import as `Date`.
- Optional chaining short-circuits whole chains: `group?.members.filter(...)` returns `undefined`, not an error — silent empty renders.

## Deployment

- docker-compose (podman-compatible): `api` (uv + uvicorn) + `web` (nginx serving SPA, proxying `/api`), named volume `data` holds SQLite + receipts. Healthcheck on `/api/health`.
- Backup = tar the `data` volume. Full DB reset = `docker compose down && docker volume rm <project>_data`.
