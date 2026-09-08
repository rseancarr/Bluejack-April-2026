# Hosting the Freestone portfolio app on Azure — handoff for IT

This is a small internal web app for a three-person investment team. It stores the team's task list,
their deal pipeline, and figures imported from the monthly accounting workbooks. It is a single
Node.js process with a database and a folder of uploaded files. Nothing about it is exotic; the
notes below are what a reviewer usually asks for, in one place.

## What it is

| | |
|---|---|
| Stack | Next.js 16 (Node 22), React 19, Prisma ORM, Tailwind. TypeScript throughout. |
| Runtime | One container (see `Dockerfile`), listening on `PORT` (default 3000). Runs as the non-root `node` user. |
| Database | SQLite file today; Prisma makes Postgres a configuration change (below). |
| Files | Uploaded accounting workbooks and documents are written to `STORAGE_DIR`. |
| Outbound calls | Only the optional Outlook/Google calendar link (allow-listed hosts, https only, 12 s timeout, 8 MB cap). No other external services, no telemetry. |
| Auth | Shared team password + signed, expiring session cookie (14 days). Entra ID single sign-on is the recommended next step (below). |
| Data sensitivity | Fund/LP financials and internal notes. Treat the database and the storage folder as confidential. |

## Recommended Azure shape

1. **Azure Container Apps** or **App Service (Linux, container)** running the image built from `Dockerfile`.
   One replica is enough; the app has no background workers.
2. **Azure Database for PostgreSQL Flexible Server** (smallest tier). See "Switching to Postgres".
   SQLite on a mounted Azure Files share also works for a three-person team, but Postgres gives you
   backups, point-in-time restore, and no file-locking worries.
3. **Azure Files** share mounted at `/data/storage` for uploaded workbooks and documents
   (a few hundred MB a year). Encrypted at rest by default; enable soft delete / snapshots.
4. **Key Vault** for `APP_PASSWORD` and `SESSION_SECRET` (and the Postgres connection string),
   referenced from the container's environment.
5. **Private access.** Put it behind the company VPN / a private endpoint, or restrict inbound to
   office and VPN IP ranges. Front Door / Application Gateway are optional; the app sets its own
   security headers and cookie flags.
6. **HTTPS only**, which App Service and Container Apps provide. The session cookie is marked
   `Secure` in production and HSTS is sent.

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | `file:/data/app.db` for SQLite on a mounted disk, or a Postgres URL. |
| `STORAGE_DIR` | yes | `/data/storage` (mounted share). Uploaded files live here. |
| `APP_PASSWORD` | yes | Shared team password. Use 16+ characters; from Key Vault. |
| `SESSION_SECRET` | yes | 32+ random characters. The app refuses to start sign-ins in production without it. Rotating it signs everyone out. |
| `TEAM_MEMBERS` | yes | `Sean,AJ,Teddy` — the names offered at sign-in and used as task owners. |
| `TEAM_TIMEZONE` | no | IANA zone for "today" on the My day page. Default `America/Los_Angeles`. |
| `CALENDAR_HOSTS` | no | Extra hosts allowed for calendar links. Outlook and Google hosts are always allowed. |
| `NODE_ENV` | yes | `production`. |
| `PORT` | no | Default 3000. |

The container starts with `prisma db push` (creates or updates the schema, never drops data) and
then `next start`. Health probe: `GET /api/health` returns `{"ok":true}` when the database answers.
The process runs as uid 1000 (`node`), so a mounted `/data` share must be writable by that uid
(Azure Files: set `uid=1000,gid=1000` in the mount options, or use an Azure Files SMB mount with
the storage account key, which grants write access to all users).

## Switching to Postgres

Prisma is provider-agnostic and the schema uses nothing SQLite-specific. Steps, done once by whoever
sets up the environment:

1. In `prisma/schema.prisma` change `provider = "sqlite"` to `provider = "postgresql"`.
2. Set `DATABASE_URL` to the Postgres connection string (`postgresql://user:pass@host:5432/db?sslmode=require`).
3. Create the initial migration from a machine that can reach the database:
   `npx prisma migrate dev --name init` (development) or `npx prisma migrate deploy` (CI/CD).
4. Change the container's start command from `prisma db push` to `prisma migrate deploy`.
5. To carry over the team's existing data from SQLite, run the app's importer against the monthly
   workbooks again (`npm run import -- <folder> --create-missing`) and re-enter tasks, or ask for a
   one-off copy script. There is no LP-level data to migrate beyond what the workbooks contain.

## Security review notes (what has been done, what to know)

- **Secrets** are read from environment variables only. `.env`, the database file, the uploaded
  workbooks, and the brand decks are excluded from git (`.gitignore`) and from the container image
  (`.dockerignore`). The repository history contains none of them.
- **Sessions** are HMAC-signed cookies (`httpOnly`, `SameSite=Lax`, `Secure` in production) carrying
  the user's name and an expiry; there is no server-side session store to protect. Rotating
  `SESSION_SECRET` invalidates every session.
- **Sign-in** is rate-limited (10 attempts per client address per 15 minutes, 200 globally) with a
  400 ms delay on a wrong password. Passwords are compared in constant time. The post-login redirect
  only accepts same-site paths.
- **Every page and file download requires a session** (`proxy.ts`); only the sign-in page, static
  assets, and `/api/health` are public.
- **Uploads** are limited to the accounting workbook types on the Import page and to a short list of
  document types (25 MB) on holdings. File names are sanitised; downloads are served as attachments
  with `nosniff`, and only from inside `STORAGE_DIR`.
- **Outbound fetches** happen only for the calendar feature, restricted to https, allow-listed hosts,
  no redirects, size-capped. This prevents the app from being used to reach internal addresses.
- **Headers**: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`,
  `Permissions-Policy`, `Content-Security-Policy` (frame-ancestors, base-uri, form-action, object-src)
  and HSTS. A full script-src CSP is not set because Next.js inlines its bootstrap scripts; if the
  reviewer requires one, it can be added with per-request nonces.
- **Service worker** is network-only: nothing is cached on devices, so financial figures never sit in
  a browser cache.
- **Dependencies**: `npm audit` is clean as of this handoff (two transitive packages are pinned via
  `overrides` in `package.json`). Re-run `npm audit` on each build.
- **Logging**: the app logs to stdout/stderr only (Prisma errors, Next request errors, a one-time
  configuration warning at first sign-in). No personal data is logged. Wire stdout to Log Analytics.
- **Data integrity**: financial numbers are stored exactly as read from the accounting workbooks with
  their sheet/cell provenance; the app computes only documented ratios. See `lib/metrics/README.md`.

## Recommended next steps once it is on Azure

1. **Entra ID single sign-on** in place of the shared password: an app registration with the three
   users assigned, OpenID Connect sign-in, and the user's name taken from the token. The current
   sign-in is isolated in `lib/actions/auth.ts`, `lib/session.ts`, and `proxy.ts`, so this is a
   contained change. It also enables Microsoft Graph access for the calendar and mailbox features
   the team has asked for, which are otherwise blocked by the tenant's calendar-publishing policy.
2. **Backups**: Postgres automated backups (7–35 days) plus Azure Files snapshots.
3. **Monitoring**: the health probe on `/api/health`, container restart policy, and an alert on 5xx.
4. **Updates**: build the image from the repository's main branch in a pipeline; `npm ci`,
   `npm run typecheck`, `npm test`, `npm run build` all run in the Dockerfile's build stage or can be
   added as pipeline steps.

## Checks run before handoff

`npm run typecheck`, `npm test` (unit tests including the workbook parser against real files, the
sign-in and session logic, and the calendar reader), `npm run build`, `npm audit`, and a build and
smoke test of the production container (health endpoint, sign-in, headers).
