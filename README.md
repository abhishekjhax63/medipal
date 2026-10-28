# MEDIPAL

A healthcare ecosystem — Blood Bank, AI Doctor, E-UPCHAR service booking, and
Ambulance assistance — built as a Vite + React frontend against a Node API
server and PostgreSQL.

## The honesty contract

This is the single most important rule in the codebase, and it is enforced
rather than merely documented:

- Missing data is rendered as missing. A facility with no published phone shows
  "Phone number unavailable."; it never shows a plausible-looking invention.
- Inventory is reported per blood group and component, using the source's own
  unit and status. A centre that exists is **not** evidence that it holds blood.
- A centre that has reported nothing reads `not_reported` — never `0 units`, and
  never "unavailable".
- Verification badges come from a stored enum. Nothing is upgraded in the
  browser, and no facility is described as verified without evidence.
- An integration without credentials reports `not_configured`. The UI shows an
  honest unavailable state instead of a simulated success.

`GET /api/health` is the authoritative, machine-readable version of this.

## Architecture

| Piece | Port | Notes |
| --- | --- | --- |
| Frontend (Vite dev server) | 5173 | `npm run dev:web` |
| API server (Node, ESM) | 8787 | `npm run dev:api`, entry `server/index.mjs` |

In development, Vite proxies `/api/*` to port 8787 (see `vite.config.ts`), so the
browser only ever talks to its own origin. In production the two processes may be
hosted separately — see *Deployment* below.

```
server/          API routes, one module per domain (blood, ai, eupchar, ambulance, auth, payments)
server/blood/    Sync providers, normalisation, freshness ladder, SSE hub, scheduler
db/migrations/   001–006, applied in filename order
src/             React application
tests/           node:test suites (unit + integration)
docs/            Integration setup detail
```

## Quick start

```bash
npm install

# 1. Configure. The two files are separate on purpose — see below.
cp .env.example .env
cp .env.server.example .env.server
# ... edit both ...

# 2. Create the database and apply migrations (needs DATABASE_ADMIN_URL).
npm run db:setup

# 3. Run everything.
npm run dev
```

The Blood Bank, E-UPCHAR and Ambulance modules need PostgreSQL. The AI Doctor
needs an AI provider key. The facility directory (OpenStreetMap) works with no
credentials at all.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API server + Vite dev server together |
| `npm run dev:web` | Vite only (5173) |
| `npm run dev:api` | API only (8787) |
| `npm run db:setup` | Create the database, create the least-privilege role, apply all migrations (idempotent) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Typecheck, then build the frontend to `dist/` |
| `npm test` | Full `node:test` suite |
| `npm start` | Run the API server (production) |
| `npm run preview` | Serve the built frontend locally |

`server/index.mjs` has **no watch mode** — restart it after changing server code.
Use `npm run dev` rather than two manual terminals if you want that handled for
you, but note `npm run dev` does not auto-restart the API either.

## Environment variables

Two files, with different trust levels. This split is deliberate: anything in
`.env` is compiled into the public browser bundle.

### `.env` — public, bundled into the frontend

Never put a secret here.

| Variable | Purpose |
| --- | --- |
| `VITE_EUPCHAR_API_BASE` | E-UPCHAR backend base. `same-origin` uses relative `/api/...` |
| `VITE_MEDIPAL_AI_ENDPOINT` | AI Doctor chat endpoint. Defaults to `/api/ai/chat` |
| `VITE_EUPCHAR_RAZORPAY_KEY_ID` | Razorpay **publishable** key id only |

### `.env.server` — secrets, read only by `server/`

Never sent to the browser.

| Variable | Required for | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Blood Bank, E-UPCHAR, Ambulance | required |
| `DATABASE_ADMIN_URL` | `npm run db:setup` only — never used by the running server | required once |
| `BLOOD_ADMIN_KEY` | Blood Bank console + Ambulance console | required for admin |
| `GEMINI_API_KEY` | AI Doctor | option A |
| `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` | AI Doctor via any other OpenAI-compatible gateway | option B — wins if set |
| `AI_SUPPORTS_IMAGES`, `AI_SUPPORTS_VIDEO_FRAMES` | AI Doctor attachments | opt-in |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | E-UPCHAR checkout | required for payments |
| `GEOAPIFY_API_KEY` | Map provider | required for maps |
| `ERAKTKOSH_*` | Live blood inventory | no authorised API is available to this project — see `docs/INTEGRATIONS.md` |
| `EUPCHAR_AUTH_GATEWAY_SECRET` | E-UPCHAR identity gateway | required for gateway auth |

Do not take this table as a statement about your own deployment. Run
`GET /api/health` — it reports the live status of each integration for the
configuration actually loaded, and it is the only place that answer is
authoritative.

Key rules:

- `DATABASE_URL` uses the least-privilege `medipal_api` role so row-level
  security actually applies. `DATABASE_ADMIN_URL` is a superuser URL used **only**
  by `db:setup`.
- Ambient process environment always wins over both files, so a hosting
  platform's dashboard variables take precedence.

### AI Doctor provider

Two mutually exclusive options. `AI_BASE_URL` always wins if it is set.

**Option A — Gemini.** Supply `GEMINI_API_KEY` alone. MEDIPAL then uses Google's
documented OpenAI-compatible endpoint
(`https://generativelanguage.googleapis.com/v1beta/openai`) with the default
model. Override `AI_MODEL` if your account uses a different model id.

**Option B — any other OpenAI-compatible gateway.** Set `AI_BASE_URL`,
`AI_API_KEY` and `AI_MODEL`. Note that `AI_MODEL` applies to both options.

Media support is never inferred from a model name — the server cannot verify a
model's capabilities at boot, so `AI_SUPPORTS_IMAGES` must be switched on
deliberately once you have confirmed it for your own model. Video is decoded to
a bounded set of temporary frames with FFmpeg and then deleted; MEDIPAL never
claims to have watched every moment of a video.

## Database

`npm run db:setup` is idempotent and non-destructive. It applies every
`db/migrations/*.sql` in filename order, each in its own transaction. Migrations
only `CREATE` or replace objects — there is no `DROP` of pre-existing tables and
no seed data for donors or inventory.

To verify migrations were applied:

```bash
psql "$DATABASE_URL" -c '\dt'
psql "$DATABASE_URL" -c 'select * from blood_public_availability limit 5'
```

## Testing

```bash
npm run typecheck
npm test
```

The suite uses `node:test` with synthetic fixtures prefixed `TESTFIX`, created
and removed by the tests themselves. Integration tests skip themselves (rather
than fail) when `DATABASE_URL` is absent, and the shared env helper blanks every
provider credential so a test run can never make a real, billable API call.

## Deployment

1. **Build the frontend:** `npm run build` → static output in `dist/`.
2. **Run the API:** `npm start` (port from `PORT`, default 8787).
3. **Serve `/api/*` on the same origin as the frontend**, or set
   `VITE_EUPCHAR_API_BASE` to the API's absolute URL at build time. The frontend
   calls `/api/ai/chat` and `/api/blood/...` relative to its own origin by
   default, so a reverse proxy in front of both processes is the simplest
   correct setup. Do not assume they can share a host without verifying it.
4. **Apply migrations** against the production database with `npm run db:setup`
   (or apply `db/migrations/*.sql` manually in order).
5. **Point OpenStreetMap at a self-hosted Nominatim/Overpass** for real traffic.
   The public endpoints are rate-limited and are not appropriate for production
   volume — see `docs/INTEGRATIONS.md`.
6. **Health check:** `GET /api/health` returns the status of every integration.

## Where the data actually comes from

| Surface | Source | Stock claimed? |
| --- | --- | --- |
| MEDIPAL blood registry | Centres that reported stock (manual entry or an authorised feed) | Yes, with provenance |
| Facility directory | OpenStreetMap (Nominatim + Overpass) | **No** — location only |
| Live blood inventory | e-RaktKosh official API | Requires credentials |

The registry and the maps directory are always presented separately and never
blended, because "a blood service is mapped here" and "this centre has 4 units
of O−" are different claims.

OpenStreetMap data is © OpenStreetMap contributors, available under ODbL 1.0.

## Not yet implemented

- Donor rewards programme (registration, verified donation history, recognition
  certificates, admin-managed reward configuration).

See `docs/INTEGRATIONS.md` for per-integration setup detail.
