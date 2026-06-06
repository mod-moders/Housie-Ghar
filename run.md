# Running Housie Ghar Locally

This guide covers how to run the Housie Ghar website manually for testing.
Two procedures are documented:

- **Procedure A — Hybrid (recommended):** PostgreSQL + Redis in Docker; backend and frontend run on the host via `npm`. Best for development and debugging.
- **Procedure B — Fallback:** Everything in Docker via `docker compose up`. Use this if the hybrid setup fails or you do not want Node installed locally.

All paths below are relative to the repo root `/Users/monk/1`. Most commands run from `HG/`.

---

## Prerequisites

- **Node.js** 20+ and **npm**
- **Docker Desktop** (running)
- **OpenSSL** (for JWT key generation — preinstalled on macOS)
- Ports free: `3000` (frontend), `4000` (backend), `5432` (Postgres), `6379` (Redis)

Check ports are free:
```bash
lsof -iTCP:3000 -iTCP:4000 -iTCP:5432 -iTCP:6379 -sTCP:LISTEN
```
If anything is bound, stop that process before continuing.

---

## One-time setup (do this once)

### 1. Create `HG/.env`

```bash
cd /Users/monk/1/HG
cp .env.example .env
```

### 2. Generate RS256 JWT keys

```bash
cd /Users/monk/1/HG
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
```

Convert to single-line escaped strings and paste them into `HG/.env`:

```bash
# Print escaped private key — copy into JWT_PRIVATE_KEY=
awk 'NF {sub(/\r/, ""); printf "%s\\n", $0}' private.pem; echo

# Print escaped public key — copy into JWT_PUBLIC_KEY=
awk 'NF {sub(/\r/, ""); printf "%s\\n", $0}' public.pem; echo
```

Open `HG/.env` and replace the placeholder values for `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY` with the strings printed above (wrap in double quotes).

### 3. Install dependencies

```bash
cd /Users/monk/1/HG/backend && npm install
cd /Users/monk/1/HG/frontend && npm install
```

---

## Procedure A — Hybrid (Recommended)

Run Postgres + Redis in Docker, backend and frontend on the host.

### A1. Start the data stores

```bash
cd /Users/monk/1/HG
docker compose up postgres redis -d
```

Verify both are healthy:
```bash
docker compose ps
```

### A2. Run migrations and seed

```bash
cd /Users/monk/1/HG/backend
npm run migrate
npm run seed
```

`seed` creates roles, the superadmin (credentials from `.env`), and a sample game.

### A3. Start the backend (terminal 1)

```bash
cd /Users/monk/1/HG/backend
npm run dev
```

Expect log lines confirming Postgres connection, Redis pub/sub init, and `listening on port 4000`.

Sanity check from another terminal:
```bash
curl -i http://localhost:4000/health    # or hit a known route from src/app.ts
```

### A4. Start the frontend (terminal 2)

```bash
cd /Users/monk/1/HG/frontend
npm run dev
```

Open <http://localhost:3000> in a browser.

### A5. Log in (staff)

Use the superadmin credentials defined in `HG/.env`:
- Email: `SUPERADMIN_EMAIL` (default `superadmin@housieghar.local`)
- Password: `SUPERADMIN_TEMP_PASSWORD` (default `ChangeMe123!`)

Players are anonymous and do not log in.

### A6. Shut down

In each `npm run dev` terminal: `Ctrl+C`. Then:
```bash
cd /Users/monk/1/HG
docker compose stop postgres redis
```
Use `docker compose down -v` only if you want to wipe the database volumes.

---

## Procedure B — Fallback (Full Docker)

Use this if Procedure A fails (e.g. local Node version conflicts, missing build tools, port collisions you cannot resolve, or you simply want isolation).

### B1. Confirm `HG/.env` exists and has real JWT keys

Same as the one-time setup above. The compose file mounts `.env` into both backend and frontend containers, so it must be in place.

### B2. Build and start the full stack

```bash
cd /Users/monk/1/HG
docker compose up --build -d
```

This starts Postgres, Redis, backend (port 4000), frontend (port 3000), and Nginx (port 80).

### B3. Run migrations and seed inside the backend container

```bash
docker compose exec backend npm run migrate
docker compose exec backend npm run seed
```

### B4. Open the site

- Direct: <http://localhost:3000>
- Via Nginx reverse proxy: <http://localhost>

### B5. Tail logs while testing

```bash
docker compose logs -f backend frontend
```

### B6. Shut down

```bash
cd /Users/monk/1/HG
docker compose down            # keep data
docker compose down -v         # wipe Postgres + Redis volumes
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Backend exits immediately with "missing env" | `.env` missing or JWT keys not set | Re-run one-time setup steps 1–2 |
| `JsonWebTokenError: secretOrPrivateKey must be an asymmetric key` | `\n` not escaped correctly in `.env` | Re-run the `awk` command above and paste the output verbatim (wrapped in `"..."`) |
| `ECONNREFUSED 127.0.0.1:5432` or `:6379` | Postgres/Redis not running | `docker compose up postgres redis -d` and wait for healthy |
| `relation "..." does not exist` | Migrations not run | `npm run migrate` (host) or `docker compose exec backend npm run migrate` |
| Port already in use | Another process is bound | Find with `lsof -iTCP:<port> -sTCP:LISTEN` and stop it, or change the port in `docker-compose.yml` / `.env` |
| Frontend cannot reach backend | Browser hit a different origin than CORS allows | Confirm `FRONTEND_URL=http://localhost:3000` in `.env` and restart backend |
| Stale data / corrupted DB | Old volume from a previous run | `docker compose down -v` then redo migrate + seed |
| Docker build is slow / fails | Cached layers or network | `docker compose build --no-cache backend frontend` |
| Game does not progress after start | Backend restarted mid-game (in-memory state lost) | Restart the game; engine state lives in memory, only the draw sequence persists in `Game_Logs` |

---

## Quick reference

```bash
# Hybrid up
cd /Users/monk/1/HG && docker compose up postgres redis -d
(cd backend && npm run dev) &
(cd frontend && npm run dev)

# Full Docker up
cd /Users/monk/1/HG && docker compose up --build -d

# Reset everything
cd /Users/monk/1/HG && docker compose down -v
```
