# Housie Ghar — Manual Launch Steps

---

## What's left — all manual

The AI-doable parts are already complete:

- **CI/CD** — `.github/workflows/ci.yml` typechecks/lints/builds on every push, plus the `https://api.housieghar.in/health` post-deploy check. ⚠️ **Its `deploy-staging`/`deploy-production` jobs curl a "Railway deploy hook" URL that Railway does not actually ship** — see Step 9, which now documents the real (simpler) mechanism: native GitHub autodeploy + the **Wait for CI** toggle. `ci.yml` itself hasn't been edited to match; its two curl jobs will fail on the missing secrets until you either fill them with a real substitute (Step 9's edge cases) or remove them.
- **Sentry (backend + frontend)** — `@sentry/node` installed with a guarded `Sentry.init` at the top of `src/server.ts`; `@sentry/nextjs` installed with guarded `src/instrumentation.ts` / `src/instrumentation-client.ts`. Both are no-ops until the DSN env vars are set — **no wizard needed**, just create the Sentry projects and set the DSNs (Step 11).
- **Secret scan** — `gitleaks` run across all 88 commits; the only two hits are placeholder PEM text in `HG/.env.example` and `PDR.md`, so no real key was ever committed.
- **Dependency audit — fixed (2026-07-02)** — `npm audit` reports **0 vulnerabilities** in both packages (`npm audit fix` in both; the frontend's nested `postcss` was lifted to ≥8.5.10 via an npm `overrides` entry; build verified). Step 15 is done — just re-run the audit before launch day for new CVEs.
- **Production bootstrap** — `npm run seed:prod` (new) idempotently creates Roles, Platform_Config defaults, and one Superadmin from `SUPERADMIN_EMAIL`/`SUPERADMIN_TEMP_PASSWORD`. It refuses to run in production with the dev defaults still set. Run it **once** in Railway after the first deploy (Step 5a).
- **Forced password change** — staff accounts with `temp_password_required` are now locked to the change-password screen on first login (backend-enforced), so seeded/reset temp passwords can't survive into real use.

Everything below needs you — accounts, payment, secrets that must never touch an AI session, dashboard configuration, or a live browser session.

| Step | Task | What you must do |
|---|---|---|
| 1 | Generate **production** RSA keypair | Keys must never be seen by AI tools. Run `openssl`, paste into Railway, then shred the local files. |
| 2 | Generate CI keypair + add GitHub Secrets | GitHub account + secret upload via the Actions UI. |
| 3 | Verify your Hostinger domain | Domain already registered at Hostinger — confirm it's active and on Hostinger nameservers in hPanel. |
| 4 | Create Railway project | Account creation and the Railway UI. |
| 5 | Configure Railway service settings | Railway UI — root directory, build / start / pre-deploy commands. |
| 6 | Set environment variables in Railway | Security-sensitive; production JWT keys, DB URLs, and passwords must never touch an AI session. |
| 7 | Deploy frontend to Vercel | Vercel account creation and UI setup. |
| 8 | DNS records in Hostinger hPanel | hPanel dashboard access. |
| 9 | Wire up Railway ↔ GitHub Actions | **Railway has no "Deploy Hook" URL feature** (confirmed against current Railway docs — it's still an open, unshipped feature request). Use native GitHub autodeploy + the **Wait for CI** service toggle instead; no GitHub Secrets needed for this step at all. |
| 10 | Enable branch protection on GitHub | GitHub Settings UI. |
| 11 | Sentry projects + DSNs | **Backend AND frontend code already wired — no wizard needed.** Create the two Sentry projects, then add `SENTRY_DSN` to Railway and `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` to Vercel. |
| 12 | Set up UptimeRobot | UptimeRobot account creation and UI setup. |
| 13 | Rotate seeded staff passwords | Log into the live app as each staff user. **The app now forces the change** for accounts flagged `temp_password_required` (the prod Superadmin from `seed:prod`, and any staff created/reset via the admin UI). Any account seeded without the flag must still be rotated by hand. |
| 14 | Review the gitleaks scan | **Already run — both hits are placeholder text, nothing leaked.** No credential rotation or history scrub needed; optionally add a `.gitleaksignore`. |
| 15 | Fix npm audit vulnerabilities | **Done (2026-07-02) — 0 vulnerabilities in both packages.** Frontend keeps `"overrides": { "postcss": "^8.5.10" }` to patch the copy nested in Next. Re-run `npm audit` right before launch for new CVEs. |
| 16 | First smoke-test in production | A browser session against the live production URL. (The same flow passed locally end-to-end on 2026-07-02, including prize settlement and the forced password change.) |

---

**Recommended stack:**

| Layer | Service | Cost |
|---|---|---|
| Frontend (Next.js 16) | Vercel — Hobby (free) | $0/month |
| Backend (Express 5 + Node.js) | Railway Web Service | ~$5–10/month |
| PostgreSQL 14 | Railway Postgres plugin | ~$5/month |
| Redis | Railway Redis plugin | ~$2/month |
| DNS | Hostinger hPanel (comes with your domain) | $0/month |
| Domain | Already owned at Hostinger | renewal only (~₹700–1,000/year for `.in`) |
| Error tracking | Sentry (free tier) | $0/month |
| Uptime monitoring | UptimeRobot (free tier) | $0/month |

**Total: roughly $12–17/month.**

PM2 and nginx are **not needed** on this stack — Railway and Vercel each manage process restarts, HTTPS, and routing natively. The `ecosystem.config.js` and `HG/nginx/nginx.conf` files are kept in the repo as a reference for self-hosted VPS deployments only (see Appendix A).

Work through these steps in order. Each one requires a human — account creation, secrets that must never touch the filesystem, external dashboard configuration.

Every step below now ends with an **"If it fails / edge cases"** block: the realistic ways that step goes wrong and the exact fix, so an error doesn't strand you mid-launch.

---

## 1. Generate production RSA keypair

These keys sign every JWT. Dev keys may have been seen by AI tools — generate fresh ones for production.

```bash
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
```

You'll paste these into Railway in Step 6. After that, destroy the local files:

```bash
shred -u private.pem public.pem
# If shred isn't available (macOS): rm -P private.pem public.pem
```

**If it fails / edge cases:**

- **Verify the pair matches before pasting anywhere:** `openssl rsa -in private.pem -pubout | diff - public.pem` must print nothing. A mismatched pair signs tokens that verify against nothing — every login "succeeds", then every following request 401s.
- Backend logs `secretOrPrivateKey must be an asymmetric key when using RS256` at the first login → the paste was truncated or the two keys were swapped. Re-paste both, **including** the `-----BEGIN/END-----` header and footer lines.
- Shredded the files before pasting? Just generate a fresh pair — keys cost nothing. But know the blast radius: swapping keys after the backend has issued cookies invalidates every existing session (all users must log in again). Harmless on launch day, disruptive later — rotate between games, never mid-play.

---

## 2. Generate CI-only RSA keypair and add to GitHub Secrets

The CI workflow typechecks and builds the backend, which requires `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY` to be present at compile time. These are throwaway keys — never use them in production.

```bash
openssl genrsa -out ci-private.pem 2048
openssl rsa -in ci-private.pem -pubout -out ci-public.pem
```

Go to **GitHub → your repo → Settings → Secrets and variables → Actions → New repository secret** and add:

| Secret name | Value |
|---|---|
| `CI_JWT_PRIVATE_KEY` | Full contents of `ci-private.pem` (copy-paste the entire PEM block including the header/footer lines) |
| `CI_JWT_PUBLIC_KEY` | Full contents of `ci-public.pem` |

Delete the local files:

```bash
rm ci-private.pem ci-public.pem
```

**If it fails / edge cases:**

- CI fails with `Missing required environment variable: JWT_PRIVATE_KEY` → the secrets must be **repository** secrets named exactly `CI_JWT_PRIVATE_KEY` / `CI_JWT_PUBLIC_KEY` (that's what `ci.yml` maps them from) — not Environment secrets, not Variables.
- Paste the PEM blocks as-is (multi-line) into the GitHub secret box; do **not** convert them to single-line `\n`-escaped strings.
- Pull requests from **forks** show these jobs red — GitHub withholds secrets from fork PRs by design. Pushes and same-repo PRs are unaffected.

---

## 3. Verify your domain in Hostinger hPanel

Your domain is already registered at Hostinger — there is nothing to buy. Two one-minute checks now save you a stuck Step 8 later:

1. **hPanel → Domains** → your domain is listed with status **Active** (not "Pending verification" or expired).
2. **Domains → (your domain) → DNS / Name Servers** → it shows **Hostinger's nameservers** (`ns1.dns-parking.com` / `ns2.dns-parking.com`). That's what makes hPanel's DNS editor authoritative — Step 8's records are created there.

**If it fails / edge cases:**

- Nameservers show something else (a previous Cloudflare/other-host setup) → either create Step 8's records at whoever those nameservers belong to, or switch back to Hostinger's here and wait for propagation (up to 24h, usually much less) before Step 8.
- The domain is currently attached to a Hostinger hosting plan or Website Builder site → its DNS zone contains A/CNAME records for `@` and `www` pointing at that hosting. You don't need to detach or cancel anything — Step 8 deletes those records, and DNS decides where traffic goes.
- Domain status "Pending" with a verification email outstanding (new registrations) → click the registrant-verification link first; some TLD registries suspend unverified domains, which surfaces later as random resolution failures.
- Want a CDN/DDoS shield later? You can add the domain to Cloudflare's free plan at any time (no transfer — just swap nameservers in hPanel). If you ever do: keep the `api` record **DNS only** (the proxy buffers the SSE live stream) and set SSL/TLS mode to **Full (strict)** (Flexible causes redirect loops). Not needed for launch.
- Want to host everything on a **Hostinger VPS** instead of Railway + Vercel? That's a different (single-server) architecture — follow `host.md`, not this file.

---

## 4. Create a Railway project

1. Go to [railway.app](https://railway.app) → click **Login** (top right) → **Login with GitHub** → authorize.
2. On the dashboard, click **New Project**.
3. A template picker opens — click **Empty Project** (usually at the bottom of the list).
4. Railway names the project something random (e.g. "improbable-happiness") — click that name at the top of the canvas to rename it, e.g. `housie-ghar`.
5. On the empty canvas, click **+ New** (top right of the canvas, or right-click the canvas).
6. Click **Database** → a submenu shows Postgres/MySQL/Redis/MongoDB icons → click **Add PostgreSQL**. It provisions in a few seconds and appears as a node on the canvas.
7. Click **+ New** again → **Database** → **Add Redis**. Same thing.
8. Click **+ New** a third time → **GitHub Repo**.
   - First time only: a "Configure GitHub App" prompt appears → click it → GitHub opens an install screen → choose your account/org → pick **Only select repositories** → check the Housie Ghar repo → **Save**.
   - Back in Railway, the repo now shows in the picker → click it → Railway asks which branch → select **main** (or `frontend-v2-housieghar` if you haven't merged yet — see the edge-case note below).
9. You now have three nodes on the canvas: Postgres, Redis, and the repo service. Click the small **gear icon** near the project name → **Usage/Plan** → confirm **Hobby** plan is active ($5/month base, plus usage); if it still says Trial, go to your account avatar (top right) → **Billing** → add a payment method.

The Postgres and Redis plugins expose `DATABASE_URL` and `REDIS_URL` for any service in the same project to consume — but this is **not automatic just by being in the same project**. You (or Step 6) still have to add a **reference variable** in the backend service that points at each plugin; that's what creates both the working connection and the connector arrow you'll see on the canvas afterward. See Step 6.1 for the exact click path.

**If it fails / edge cases:**

- Your repo doesn't appear in the picker → the Railway GitHub App was never granted access to it. GitHub → **Settings → Applications → Railway → Configure** → grant the `Housie-Ghar` repo (an org-owned repo needs an org admin to approve).
- No arrow drawn between the repo service and Postgres/Redis on the canvas → this is expected until you add the reference variables in Step 6.1 — the canvas draws that connector *from* the reference, it doesn't infer it from project membership. Don't troubleshoot this now; it resolves itself in Step 6.
- `DATABASE_URL` / `REDIS_URL` come up empty (or absent) in the backend service's Variables tab → either you haven't added the reference yet (see Step 6.1), or the plugins and the service don't live in the **same project and environment** — reference variables can only point at services within that same scope.
- Selecting the branch: the service deploys whatever branch you pick here. If the launch code lives on `frontend-v2-housieghar` and hasn't been merged, either merge to `main` first (recommended — CI and branch protection are wired for `main`) or point the service at that branch and remember Step 9's hooks also deploy that branch.

---

## 5. Configure the Railway backend service

1. Click the **repo service node** on the canvas (not Postgres, not Redis) — this opens its detail panel with tabs along the top: **Deployments / Variables / Metrics / Settings**.
2. Click **Settings**.
3. Under the **Source** (or **General**) section, find **Root Directory** → click into the field, type `HG` (**not** `HG/backend` — see the correction below). It autosaves on blur (a small toast may confirm it).
4. Scroll to the **Build** section:
   - **Build Command** → click the override toggle/field → type `cd backend && npm ci && npm run build`.
5. Scroll to the **Deploy** section:
   - **Start Command** → `cd backend && npm start`
   - **Pre-Deploy Command** → `cd backend && npm run migrate` (this may be its own collapsible sub-section just below Start Command).
6. Scroll further to **Networking**:
   - Click **Generate Domain**. Railway asks which port to expose — type `4000` (matches your `PORT` var) → confirm. It shows a URL like `housie-ghar-backend-production.up.railway.app`. Copy it somewhere — you need it twice (Vercel's env var in Step 7, and again for the custom domain in Step 8).
   - Later, add your custom domain `api.housieghar.in` here too (Step 8).
7. Click over to the **Deployments** tab to watch it attempt a build. It's expected to crash-loop right now — that's fine, keep going to Step 6.

> ⚠️ **Correction (2026-07-11): Root Directory must be `HG`, not `HG/backend`.** An earlier draft of this step set Root Directory to `HG/backend` directly, which seemed like the obvious choice — but the backend's `tsconfig.json` imports shared types from a **sibling** directory (`HG/shared/types`, aliased as `@shared/types/*`, per the Architecture section's `shared/types/` note above). Root Directory controls what Railway copies into the build context — pin it to `HG/backend` and `HG/shared` is simply never copied in at all. The build then fails with `tsc` exiting code 2, unable to resolve `@shared/types/*` — not a path-alias misconfiguration, the files are just physically missing from the container. Setting Root Directory to the parent `HG` folder puts both `backend/` and `shared/` in the build context together (matching their real on-disk relationship), and prefixing every command with `cd backend &&` keeps the actual build/start/migrate work scoped to the backend package once inside.
>
> ⚠️ **Second-order correction, same day: that broader Root Directory breaks Node auto-detection — fixed via `HG/railpack.json`, now committed to the repo.** Railway's build system normally detects "this is a Node.js project" by finding a `package.json` sitting directly in Root Directory. Once Root Directory became `HG`, that detection broke (`package.json` only exists one level down, in `HG/backend` and `HG/frontend`), so the build image was created with **no Node.js/npm installed at all** — every command in this step failed with `sh: 1: npm: not found` (exit 127), regardless of the commands themselves being correct. This repo's Railway service builds with **Railpack** (Railway's current builder — an earlier attempt at fixing this with a `nixpacks.toml` file did nothing, because Railpack doesn't read that format). The fix, now committed at `HG/railpack.json`, declares the provider explicitly so Node gets installed regardless of `package.json` location:
> ```json
> { "$schema": "https://schema.railpack.com", "provider": "node", "packages": { "node": "22" } }
> ```
> This file is already in the repo — nothing further to do here unless you're setting this project up somewhere Railpack isn't the builder (check **Settings → Build** for a **Builder** field if you ever see `npm: not found` again despite this file existing).

The pre-deploy command runs `ts-node src/db/migrate.ts` before every deploy, keeping the schema up to date without manual intervention.

**If it fails / edge cases:**

- Build Logs show `sh: 1: npm: not found` (exit code 127) on the very first command → Node.js itself was never installed into the build image — see the second correction above. Confirm `HG/railpack.json` exists in the repo (it should, already committed) and that **Settings → Build → Builder** is actually set to a builder that reads it (Railpack). If you switch builders later, this file may need a different format.
- Build fails `tsc: not found` — or the pre-deploy migrate fails `ts-node: not found` → devDependencies got pruned. Add the variable `NPM_CONFIG_PRODUCTION=false` and redeploy; both the compiler and the migration runner live in devDependencies.
- Build fails with `tsc` exiting code 2, unable to resolve `@shared/types/*` → this is the Root Directory mistake described above. Root Directory must be `HG`, and Build/Start/Pre-Deploy Commands must all start with `cd backend &&` to compensate.
- "Could not find package.json" / instant build failure → **Root Directory** must be exactly `HG` — case-sensitive, no leading or trailing slash. If it's still failing with Root Directory set correctly, check that the three commands all have the `cd backend &&` prefix — without it, Railway runs `npm ci`/`npm start`/`npm run migrate` against the `HG` root, which has no `package.json` of its own.
- Pre-deploy migrate fails with `ENOTFOUND postgres.railway.internal` or `ECONNREFUSED` → either the Postgres plugin isn't in this environment, `DATABASE_URL` was never added as a reference variable at all (see Step 6.1), or someone overrode it with a manually-typed value. Add/re-add it as a reference to the Postgres service rather than typing a connection string.
- First deploy crash-loops with `Missing required environment variable: …` → **expected** until Step 6's variables exist (`config/env.ts` throws on any missing var at boot). Do Steps 5 and 6 back-to-back and only then judge the deploy.
- Deploys are slow or rebuild with no changes → confirm only one service watches the repo; two services watching the same repo double-deploy on every push.
- With Root Directory now at the broader `HG` (covering both `backend/` and `frontend/`), a push that only touches frontend files will still trigger a backend redeploy (Railway watches the whole Root Directory by default). Harmless — the build is fast and idempotent — but if it bothers you, look for a **Watch Paths** setting in this same Settings page and scope it to `HG/backend/**` and `HG/shared/**`.

---

## 6. Set environment variables in Railway

**Why this step exists at all:** `HG/backend/src/config/env.ts` reads every one of these from `process.env` at process boot and **throws synchronously** if any required one is missing — this is why Step 5's first deploy crash-looped. Nothing in this step is optional; the backend will not start (not "start with a degraded feature," it will not start at all) until all required variables are present and well-formed.

**Security framing — why this step is flagged "must never touch an AI session":** `JWT_PRIVATE_KEY` signs every login cookie in the system; anyone who has it can mint a valid Superadmin session without a password. `SUPERADMIN_TEMP_PASSWORD` is the credential for the account that can create/suspend/reset every other account. Type or paste these directly into the Railway web UI in your own browser — never into a chat with an AI tool, a shell command an AI tool will see the output of, or a file an AI tool will read. Everything else in this table is lower-stakes but still: treat the whole Variables tab as production secrets storage, because that's what it is.

### 6.1 — Open the Variables tab and connect Postgres + Redis

1. On the Railway project canvas, click the **backend service node** (the one you configured in Step 5 — it has your repo's name, not "Postgres" or "Redis").
2. Along the top of the detail panel: **Deployments / Variables / Metrics / Settings**. Click **Variables**.
3. `DATABASE_URL` and `REDIS_URL` are **not** there automatically — being in the same Railway project does not, by itself, wire a plugin's variables into your service. You have to add each as a **reference variable** explicitly:
   - Click **+ New Variable**. Type the Key as `DATABASE_URL`.
   - Click into the **Value** field — look for a small database/chain-link icon at the edge of the input (sometimes it appears as a dropdown the moment you focus an empty Value box). Click it.
   - A picker lists the other services in the project. Choose **Postgres → DATABASE_URL**. Railway inserts a reference expression (looks like `${{Postgres.DATABASE_URL}}`) and saves the row — the Value column now shows a small link/plug icon marking it as a reference rather than typed text.
   - Repeat with Key `REDIS_URL`, picking **Redis → REDIS_URL** from the same picker.
   - Back out to the project canvas view: you should now see connector arrows drawn from the Postgres and Redis nodes into the backend service node. If you don't see them yet, refresh the canvas — the connectors are drawn from these references and can lag a beat behind the Variables tab.
4. Once both show the link/plug icon, **leave them alone** — do not click in and retype a value, and do not add a second row with the same name. A manually-typed connection string shadows the reference and silently disconnects you from the plugin's real, current credentials the moment you save it (see Step 5's edge cases for the `ENOTFOUND`/`ECONNREFUSED` symptom this causes).

### 6.2 — Add each variable, one row at a time (recommended path — start here if you've never used Railway before)

This sub-step assumes you have never touched Railway's Variables screen before. Read it slowly the first time; it only takes a minute per variable once you've done one.

**What you're looking at.** After Step 6.1 you should be sitting on the backend service's **Variables** tab. This page is just a list of "settings" for your app, each one a **name** (Railway calls it the **Key**) paired with a **secret value** (the **Value**) — e.g. the Key `NODE_ENV` paired with the Value `production`. Your app reads these the moment it starts up. If you've never seen an "environment variable" before: think of it as a sealed envelope of settings that lives outside your code, so you can change how the app behaves (or store passwords) without editing and re-uploading any files.

**Step by step, for one variable:**

1. Look near the top of the Variables panel for a button labeled **+ New Variable** (sometimes just a **+** icon). Click it once.
2. A new, empty row appears with two boxes side by side: a narrow one on the left (this is the **Key** box) and a wider one on the right (the **Value** box).
3. Click inside the **left/Key box**. A text cursor should start blinking there. Type the variable's name **exactly** as it's spelled in the table in 6.4 below — capital letters and underscores matter. For example type `NODE_ENV` — not `node_env`, not `NodeEnv`, and don't add a space before or after it. Typos here are the #1 beginner mistake: `NODE_ENV ` (with a trailing space) is treated as a completely different, unrecognized variable, and your app will behave as if you never set it at all.
4. Move to the **right/Value box** — either click into it directly, or press the **Tab** key on your keyboard to jump there automatically. Type or paste the value that belongs to that Key (the full list is in the table in section 6.4 below).
   - For most rows this is a short, one-line answer, e.g. `production` or `4000` — just type it plainly, **no quotation marks** around it. (If you type `"production"` with the quote marks included, Railway saves those quote marks as literal characters, and the app will see a value it doesn't recognize — quotes are not needed here the way they might be in some code you've seen.)
   - Two rows are different and deserve extra care: `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY`. These come from the `private.pem` and `public.pem` files you generated in Step 1 — each one is several lines of random-looking text, starting with a line like `-----BEGIN RSA PRIVATE KEY-----` and ending with a matching `-----END-----` line. Open that file (e.g. in a text editor, or print it in your terminal with `cat private.pem`), select **all** of its text including those first and last lines, copy it, then click into the Value box in Railway and paste. The box will grow taller automatically to fit it — you don't need to do anything special, and you don't need to make it fit on one line.
5. Once the Value looks right, either press the **Enter** key, or look for a small checkmark (✓) icon at the end of that row and click it. This "saves" or "commits" the row — meaning Railway now stores it. The row will settle into place in the list, and the Value may show as a row of dots (••••••) instead of the real text — that's Railway automatically hiding anything that looks like a secret, purely so it's not visible to anyone glancing at your screen. It's still stored correctly. If you want to double-check exactly what you typed, look for a small eye icon on that row and click it to reveal the real value again.
6. That's one variable done. Click **+ New Variable** again and repeat steps 3–5 for the next row in the table in 6.4, until all of them are added.

**A few things that surprise first-timers:**
- There is no single "Save all" button — each row is saved the moment you press Enter/click the checkmark on it, one at a time.
- Every time you save a row, Railway may immediately start rebuilding and restarting your app in the background (you might see a small notification about a "new deployment"). This is normal and expected while you're adding many variables in a row — don't stop to investigate each one; just keep adding rows, and check the final result once in Step 6.5.
- If you make a mistake on a row you already saved, just click into that row again (click on the Value text itself) to edit it, fix it, and press Enter again to re-save — you don't need to delete and recreate the row.

### 6.3 — Alternative: the Raw Editor (bulk paste, optional)

Railway's Variables tab also has a **Raw Editor** toggle/button (usually top-right, next to **+ New Variable**) that lets you paste many `KEY=VALUE` lines at once instead of adding rows one at a time. It is safe to use — Railway still encrypts each resulting variable individually, so "don't paste a raw `.env` file" above is not a security warning about this feature, it's a **format** warning:

- In the Raw Editor, a value that spans multiple lines (your PEM keys) must be wrapped in quotes with real newlines escaped as `\n`, e.g. `JWT_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIEow...\n-----END RSA PRIVATE KEY-----\n"`. This is the **opposite** of the single-row Value box, which wants the literal multi-line PEM with no escaping and no surrounding quotes.
- If you're not confident converting your PEM files to that one-line escaped form correctly, use the per-row method in 6.2 for the two JWT keys specifically — it's the format-safe path — and reserve the Raw Editor (if you use it) for the plain single-line values.
- Never paste your actual local `HG/.env` file wholesale into the Raw Editor even though the format would technically parse: that file may carry dev-only values (dev JWT keys, `NODE_ENV=development`, localhost URLs) that would silently overwrite the production-correct values you're setting here.

### 6.4 — The variables, what each one does, and what breaks if it's wrong

| Variable | Value | What it actually controls | What breaks if missing/wrong |
|---|---|---|---|
| `NODE_ENV` | `production` | Gates dev-only code paths: disables the `POST /api/bookings/:id/dev-bypass` endpoint (returns 404), disables `npm run seed` (throws instead of seeding fake data), changes some logging verbosity. | Left as `development` (or unset): the dev-bypass booking shortcut stays **live in production** — anyone who finds the route can auto-confirm a booking without an agent, and Step 16's smoke test check #3 will fail. |
| `PORT` | `4000` | The port the Express server binds to inside the container. Must match the port you told Railway to expose when you clicked **Generate Domain** in Step 5. | Mismatch between this and the exposed port: the container is healthy internally but Railway's edge routes traffic to a port nothing is listening on — requests time out or 502, even though Deploy Logs show the server "running" fine. |
| `DATABASE_URL` | *(added as a reference to Postgres in Step 6.1 — never type a value here)* | Postgres connection string, host/port/user/password/dbname all bundled. Read by `db/index.ts`'s pool singleton. | Typed manually instead of referenced, or never added at all: either you've frozen today's plugin-internal hostname/credentials into a static value that breaks the moment Railway rotates/moves the Postgres instance (`ENOTFOUND`/`ECONNREFUSED`), or the pool has nothing to connect to and the app never boots. |
| `REDIS_URL` | *(added as a reference to Redis in Step 6.1 — never type a value here)* | Redis connection string for both clients in `db/redis.ts` (the pub/sub publisher and subscriber that fan out game events to SSE + Socket.io). | Same failure class as `DATABASE_URL` above, but the symptom is scoped to real-time features: the site loads, login works, but the live board never receives draws and staff dashboards never receive booking events. |
| `JWT_PRIVATE_KEY` | Full contents of Step 1's `private.pem` | Signs every JWT this backend issues (both `hg_auth_token` for staff and `hg_player_token` for players) using RS256. | Missing: boot throws immediately (`env.ts` requires it). Malformed (truncated paste, missing header/footer, swapped with the public key): boot may still succeed but every login attempt 500s with `secretOrPrivateKey must be an asymmetric key when using RS256` in the logs. |
| `JWT_PUBLIC_KEY` | Full contents of Step 1's `public.pem` | Verifies JWTs signed by the private key above — used on every authenticated request by `middleware/auth.ts`. | Mismatched with the private key (e.g. you regenerated one but not the other): tokens sign successfully at login, then fail verification on the very next request — users appear logged in for one screen, then get bounced. |
| `FRONTEND_URL` | `https://housieghar.in` (add `,https://www.housieghar.in` once both apex and `www` are live — see Step 8) | The CORS allow-list (`app.ts` splits this string on commas) **and** the Socket.io allowed-origins list. Every browser request the backend accepts must originate from a URL in this list. | Wrong scheme, wrong host, trailing slash, or `www` missing when players land on `www`: the backend rejects the request at the CORS layer before your route code ever runs. Symptom is deceptive — pages render fine (that's just static assets/routing on Vercel's side), but every API call including login fails with a CORS error in the browser console, and staff dashboards silently never receive live Socket.io events because they fail the same origin check. |
| `SUPERADMIN_EMAIL` | A real mailbox you can receive mail at | The email address `seed:prod` (Step 6a) uses to create the one production Superadmin account. | Left as a placeholder/dev value: `seed:prod` explicitly **refuses to run** ("Refusing to bootstrap production with dev defaults") rather than create an account you can't actually log into or recover. |
| `SUPERADMIN_TEMP_PASSWORD` | A strong random value, generated once, used once | The initial password for that same Superadmin account. `temp_password_required` is set `TRUE` alongside it, so the app forces a real password to be chosen on first login. | Same refusal as above if left at the dev default. If you reuse a password you use elsewhere: it only has to work once (you'll be forced to change it immediately), but it sits in Railway's variable history and in your terminal/clipboard history until then — treat it as compromised the moment you type it anywhere else. |
| `JWT_EXPIRY` | `8h` | How long an issued JWT stays valid before the cookie is rejected and the user must log in again — passed straight to the `jsonwebtoken` sign call. | Set too short (e.g. `5m`): staff get logged out mid-shift, mid-game even, which is disruptive for an operator running a live draw. Set too long or omitted (some libraries default to a long or infinite expiry): a stolen/leaked cookie stays valid far longer than intended. `8h` covers one full shift without being open-ended. |

### 6.4a — FRONTEND_URL, SUPERADMIN_EMAIL, SUPERADMIN_TEMP_PASSWORD, JWT_EXPIRY — in plain terms

The table above packs a lot into each cell. Here are the same four rows again, slower, as if you're typing them into Railway for the first time. For each one: what you type in the **Key** box (left), what you type in the **Value** box (right), and why.

**Row 1 — `FRONTEND_URL`**
- In the **Key** box, type exactly: `FRONTEND_URL`
- In the **Value** box, type exactly: `https://housieghar.in`
- What this is, in plain English: it's simply the web address of your player-facing site — the same address you'd type into a browser to visit it. You're telling the backend server "only accept requests that came from this website." Right now you might not have `https://housieghar.in` live yet (that happens in Step 8), so for now use whatever Vercel gave you in Step 7 instead (something like `https://housie-ghar-frontend.vercel.app`) — no trailing `/` at the very end either way. **After Step 8**, come back to this exact row, click on it, delete the old value, and replace it with `https://housieghar.in,https://www.housieghar.in` (both addresses, separated by one comma, no space after the comma) — that covers people who type `www.` in front and people who don't.
- Why it matters: if this value doesn't exactly match the address the player is actually using in their browser, the browser's own security rules will block your app from talking to the server — pages will still appear, but nothing that needs the server (logging in, loading games) will work, and you'll see the word "CORS" in a red error in the browser's developer console.

**Row 2 — `SUPERADMIN_EMAIL`**
- In the **Key** box, type exactly: `SUPERADMIN_EMAIL`
- In the **Value** box, type: an email address that's really yours and that you can actually open — e.g. `you@gmail.com`. It does not need to be a fancy company email; any inbox you personally check is fine.
- What this is: this becomes the login username for the very first, most powerful account in the app (the "Superadmin," who can create every other staff account). Whatever you type here is what you'll type into the login form later, in Step 6a/13.
- Why it matters: if you leave this at whatever placeholder value the project came with (a fake/example email), a safety check refuses to create the account at all, on purpose — so you don't end up with an account nobody can access.

**Row 3 — `SUPERADMIN_TEMP_PASSWORD`**
- In the **Key** box, type exactly: `SUPERADMIN_TEMP_PASSWORD`
- In the **Value** box, type: any password you make up right now — for example mash your keyboard, or use a password manager's "generate" button. It just needs to be reasonably long and not something obvious like `password123`.
- What this is: the very first password for that same Superadmin account from Row 2. It's called "temp" (temporary) because the app is built to immediately force you to pick a brand-new password the first time you log in with it — so this value only ever gets used once, for a few seconds, before you replace it yourself inside the app.
- Why it matters: because it's only used once and then discarded, you don't need to memorize it or write it down carefully — you'll type it once at your very first login, then the app will immediately make you choose a real one on the spot.

**Row 4 — `JWT_EXPIRY`**
- In the **Key** box, type exactly: `JWT_EXPIRY`
- In the **Value** box, type exactly: `8h`
- What this is: it controls how long you (or any staff member) get to stay logged in before the app makes you log in again. `8h` means "8 hours" — roughly one work shift. You don't need to calculate anything or use a different format; `8h` is a ready-to-use value that this codebase understands directly.
- Why it matters: this is the one row in the whole table where the exact value matters less than just "having a sensible one" — `8h` is already the recommended value, so unless you have a specific reason to change it, just copy it exactly as shown, including the lowercase `h` with no space before it (`8h`, not `8 h` or `8H`).

### 6.5 — Confirm the deploy picked everything up

1. After the last variable commits, look for a banner near the top of the service panel reading something like "New deployment triggered." If you don't see one within a few seconds, click **Deploy** (top-right of the service panel) to force it manually.
2. Click the **Deployments** tab → click the newest entry (it should be at the top, timestamped just now) → this opens the deployment's detail view → click its **Deploy Logs** sub-tab.
3. Read the log stream top to bottom. You're looking for a structured Pino JSON line that says the server is listening — something like `{"level":30,"msg":"Server listening on port 4000",...}`. That line is your confirmation every required variable was present and well-formed enough for `env.ts` to pass and for the HTTP server to bind.
4. If the deployment instead shows a **crash/exit** status before that line appears, open Deploy Logs and read the **last** line printed before the crash — `env.ts` throws a specific `Missing required environment variable: <NAME>` message naming exactly which one is absent; fix that one variable and it will redeploy automatically.

**If it fails / edge cases:**

- Paste PEM values **without** surrounding double quotes in the single-row Value box — quotes are `.env`-file/Raw-Editor syntax, not part of the key itself. Railway stores the raw multi-line value as you pasted it.
- Logins 500 and the logs show `secretOrPrivateKey must be an asymmetric key` or `error:0909006C:PEM routines` → a PEM got mangled: missing `BEGIN/END` line, trailing whitespace, a partial paste, or the private/public values got swapped into each other's fields. Re-paste both keys from the original files (Step 1's edge cases cover verifying the pair matches with `openssl rsa -in private.pem -pubout | diff - public.pem`).
- `FRONTEND_URL` is the most error-prone value in this table: exact scheme + host, **no trailing slash**. The backend splits it on commas, so covering both apex and www is `https://housieghar.in,https://www.housieghar.in`. Symptom when wrong: pages render fine, but every login dies with a CORS error in the browser console and staff dashboards never receive live events (Socket.io checks the same origin list).
- Boot log shows a Redis or Postgres connection error rather than the Pino "running" line → check that variable's row for the link/plug icon. No icon means it's a typed value, not a reference (or the reference was never created) — delete the row and re-add it via **+ New Variable** → the reference picker, pointing at Postgres/Redis as in Step 6.1.
- Changing a variable here redeploys the **backend** only. Frontend `NEXT_PUBLIC_*` values (Step 7) bake in at build time and need a separate Vercel redeploy — Railway changing does not touch Vercel at all.
- Accidentally committed a typo'd variable and it already redeployed → just fix the value and save again; Railway redeploys on every variable change, there's no "undo" needed, the bad deploy is simply superseded by the next one.

### 6a. One-time production bootstrap (after the first successful deploy)

A freshly migrated database has no Roles and no Superadmin — the app boots but nobody can log in.

**Getting a shell into the running service — this changed in June 2026.** Railway no longer relies on an in-browser terminal tab for this; the current, Railway-documented path is CLI-based SSH straight into the live container:

1. Install the Railway CLI locally if you haven't: `npm i -g @railway/cli` (or `brew install railway` on macOS).
2. `railway login` → opens a browser tab to authorize.
3. `cd` into the repo, then `railway link` → pick the `housie-ghar` project, the right environment (`production`), and the backend service when prompted. This creates a local `.railway` link so subsequent commands know which service you mean.
4. `railway ssh` → first run, the CLI notices you have no registered key and offers to register one (`~/.ssh/id_ed25519.pub` or similar) — accept it. This opens an interactive shell **inside the actual running container**, same env vars loaded, same filesystem.
   - If you manage multiple services in the project, disambiguate with `railway ssh --service <name>` (or `--environment <env>` if it can't infer it).
5. In that shell, type:
   ```bash
   npm run seed:prod
   ```
   Press Enter, watch it print confirmation of Roles/Platform_Config/Superadmin created.
6. Type `exit` to close the SSH session when done.

(If your Railway dashboard still shows a "Shell" option under a deployment's **⋯** menu, that also opens a shell in-browser — Railway hasn't announced removing it, `railway ssh` is simply the actively-developed, CLI-first path going forward and is what these steps assume.)

It is idempotent (safe to re-run) and creates only: the four Roles, `Platform_Config` defaults, and one Superadmin from `SUPERADMIN_EMAIL` + `SUPERADMIN_TEMP_PASSWORD` with `temp_password_required = TRUE`. It **refuses** to run in production while those two variables still hold the dev defaults. On your first login the app forces you to set a real password.

**If it fails / edge cases:**

- `relation "roles" does not exist` → migrations never ran (Step 5's pre-deploy command is missing or failed). Run `npm run migrate` in the same shell, then re-run `seed:prod`.
- `Refusing to bootstrap production with dev defaults` → set real `SUPERADMIN_EMAIL` + `SUPERADMIN_TEMP_PASSWORD` in Variables first. This refusal is a feature.
- Re-running is always safe, but know its limit: if **any** Superadmin already exists it skips creation entirely. Changing `SUPERADMIN_EMAIL` later and re-running does **not** create a second account, rename the first, or reset a password. Locked out? Use the database recovery in Step 13's edge cases.
- Ran `npm run seed` by mistake → it throws immediately in production and writes nothing. Only `seed:prod` is production-safe.
- `railway ssh` hangs or refuses to connect → the target service must actually be running (a crash-looping deploy has no container to attach to). Check the **Deployments** tab shows an active/healthy deployment first.
- `railway link` picks the wrong project/service → re-run `railway link` any time to re-select; it's not sticky beyond the local directory it was run in.

---

## 7. Deploy the frontend to Vercel

1. Go to [vercel.com](https://vercel.com) → **Sign Up** → **Continue with GitHub** → authorize.
2. Dashboard → click **Add New…** (top right) → **Project**.
3. On the "Import Git Repository" list, find the Housie Ghar repo. If it's not listed, click **Adjust GitHub App Permissions** (a link near the list) → grant Vercel access to the repo on GitHub's install screen → back on Vercel, it now appears → click **Import**.
4. On the Configure Project screen, set these overrides before deploying:

| Setting | Value |
|---|---|
| **Root Directory** | `HG/frontend` (click **Edit** next to it → a file-tree picker/text field opens → select/type it → confirm) |
| **Framework Preset** | Next.js (flips to this automatically once Root Directory is correct) |
| **Build Command** | `npm run build` (default) |
| **Output Directory** | `.next` (default) |

5. Expand the **Environment Variables** section on the same screen and add one:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | Your Railway backend URL — e.g. `https://housieghar-backend-production.up.railway.app` (the Railway-generated domain from Step 5). Update to `https://api.housieghar.in` after Step 8. |

Type the Key and Value, click **Add**.

6. Click **Deploy** (big button, bottom of the form). Watch the build log stream for ~2 minutes; it ends on a congratulations screen with the live `*.vercel.app` URL.

**If it fails / edge cases:**

- "No Next.js version detected" → **Root Directory** wasn't set to `HG/frontend` before the first build. Fix it in Project Settings and redeploy.
- `NEXT_PUBLIC_API_URL` must have **no trailing slash** — the frontend concatenates `${BASE}${path}`, so a trailing slash yields `//api/...` URLs that 404. All three transports (fetch, the SSE `EventSource`, and Socket.io) read this one variable.
- **Login looks broken on the temporary `*.vercel.app` URL — expected, don't debug it.** The auth cookies are SameSite-restricted (`lax`/`strict`), and `vercel.app` ↔ `up.railway.app` are different *sites*, so the browser refuses to attach them cross-site. It resolves itself in Step 8 when frontend and API share one site (`housieghar.in` + `api.housieghar.in`). Only judge logins after Step 8.
- Changed `NEXT_PUBLIC_API_URL` and nothing happened → it's baked in at build time. Trigger **Deployments → Redeploy** every time it changes.

---

## 8. Point your domain at Railway and Vercel (Hostinger hPanel DNS)

1. Log into **hPanel** (hpanel.hostinger.com).
2. **Domains** (left sidebar or top nav) → click your domain name → opens its dashboard.
3. Find the **DNS / Nameservers** section — often a top tab reading **DNS Zone Editor**, sometimes nested under **Advanced**.
4. **First, delete the stale records:** for every row where **Name** is `@` or `www` and **Type** is A/AAAA/CNAME, click the **trash/delete icon** on the right of that row → confirm. Hostinger pre-fills these to point at its parking page (or at your hosting plan, if the domain was ever attached to one). Leave `MX`/`TXT` records alone if the domain handles email.
5. Click **Add New Record** (usually above the table) and add these three, one at a time (fill Type → Name → Points to → save each row before starting the next):

| Type | Name | Points to | TTL |
|---|---|---|---|
| A | *(leave blank — see correction below)* | Vercel's apex IP — shown on Vercel's Domains screen when you add the domain (currently `76.76.21.21`) | 300 (or default) |
| CNAME | `www` | `cname.vercel-dns.com` | 300 (or default) |
| CNAME | `api` | your Railway backend domain from Step 5 (e.g. `housie-ghar-production.up.railway.app`) — **type your real value, no angle brackets, no `https://`, no trailing slash** | 300 (or default) |

(The root is an `A` record, not a CNAME, because Hostinger — like most DNS hosts — doesn't allow a CNAME on `@`.)

> ⚠️ **Correction (2026-07-11): don't type `@` into the Name field for the root/apex row.** Most DNS providers use `@` as shorthand for "the domain itself," and it's tempting to type it literally — but Hostinger's DNS Zone Editor already labels that field with a `(root)` hint and rejects a literal `@` on top of it, throwing `DNS record validation error: Invalid RRset name @ (root).housieghar.in`. **Leave the Name field completely empty** for this row instead — an empty Name is how Hostinger represents the apex internally. If an empty field also won't save, try typing the full domain (`housieghar.in`) into Name instead of `@`. This only affects the root row — the `www` and `api` CNAME rows still want their literal names (`www`, `api`) typed in as shown.

6. Hostinger DNS usually propagates in minutes but can take a few hours. Verify before continuing:

```bash
dig +short housieghar.in api.housieghar.in
```

Expected: the apex prints Vercel's IP; `api` resolves through the Railway CNAME.

7. **Attach the custom domains:**

- **Vercel:** open the project → **Settings** tab → left sidebar **Domains** → type `housieghar.in` in the input box → **Add**. Repeat for `www.housieghar.in`. The Domains screen shows the exact record values it expects — if they differ from the table above, Vercel's values win, and if it asks for an extra TXT verification record, copy it and add it in hPanel's DNS editor the same way as above. It auto-issues a Let's Encrypt certificate.
- **Railway:** backend service → **Settings** → **Networking** section → under **Custom Domain** click **+ Custom Domain** → type `api.housieghar.in` → **Add**. Railway shows the CNAME it expects (should already match what you set in step 5) and auto-issues a certificate.

**In plain terms — what to actually do (read this first if the rest of this box is too technical):**

1. This is **not an error** — nothing is broken, and there is no button to click to "fix" it.
2. It just means the DNS instruction you gave Hostinger in Step 8.5 hasn't finished spreading across the internet yet — that takes real time, from minutes to a few hours.
3. Go back and double-check the row in Hostinger where **Name = `api`**: confirm **Type = CNAME** and **Points to** is your clean Railway domain (no `https://`, no `/` at the end, no `< >` brackets). Fix it if it's wrong.
4. If that row looks correct, just wait 15–30 minutes, then refresh the Railway page. The status will flip to a green checkmark on its own — nothing else to do.
5. Only if it's still stuck after **several hours** (not minutes) is something actually wrong — at that point, work through the detailed explanation below.

**What you'll see right after clicking Add, in detail:** Railway doesn't validate anything instantly — it can't, because DNS lives outside Railway entirely, on Hostinger's servers, and changes there take real time to spread across the internet. So the moment you add `api.housieghar.in`, Railway shows a row for it with a status line like:

```
api.housieghar.in
Port 4000 · Waiting for DNS update · Show DNS records
```

This is a **normal, expected waiting state** — not an error, and not something to retry or re-add. Here's what each part means and what to do:

- **`Port 4000`** — confirms Railway correctly picked up that your app listens on port 4000 (from your `PORT` variable / the domain you generated in Step 5). Nothing to check here unless this number looks wrong.
- **`Waiting for DNS update`** — Railway is periodically re-checking, in the background, whether `api.housieghar.in` on the public internet actually points to your backend yet. It hasn't seen that yet, so it's still waiting. It will keep checking on its own; you don't need to click anything to make it re-check.
- **`Show DNS records`** — click this link/button to open a small panel showing you exactly what Railway expects to see: a CNAME record named `api` pointing at your `*.up.railway.app` domain. This is worth clicking once right away, purely to **compare it against what you actually typed into Hostinger's DNS editor in Step 8.5** — if there's a typo in either place, this comparison is how you catch it without waiting around first.
- Once the DNS Railway sees out in the world matches what it expects, this line will change on its own — the "Waiting for DNS update" text is replaced with a green checkmark / "Valid" / padlock icon, and a TLS certificate is automatically issued a moment later. No button to click to "finish" it; it resolves itself.

**How long this actually takes, and how to check without just staring at the Railway page:** DNS propagation is not instant — when you save a record in Hostinger, that change has to spread from Hostinger's nameservers out to every DNS resolver on the internet (including whichever one your own laptop/phone is using), and different resolvers refresh at different speeds. In this setup it's typically minutes, occasionally up to a few hours. Rather than repeatedly refreshing the Railway dashboard, check propagation directly from your terminal:

```bash
dig +short api.housieghar.in
```

- If this prints **nothing at all**, the DNS record hasn't propagated to your resolver yet (or wasn't saved correctly in Hostinger — go re-check that CNAME row). Keep waiting, or see the edge cases below if it's been a long time.
- If this prints something — a hostname (through the CNAME chain) or an IP address — DNS has propagated, at least as far as your own machine can see. Railway's own check should catch up shortly after and flip the status to Valid on its own.

With plain Hostinger DNS there's no proxy between the certificate authority and your services, so both certs normally issue within minutes of DNS propagating.

8. Once both show a green "Valid"/padlock status, update two values:
   - Railway → **Variables** tab → click the `FRONTEND_URL` value → edit to `https://housieghar.in` → save (auto-redeploys).
   - Vercel → **Settings** → **Environment Variables** → edit `NEXT_PUBLIC_API_URL` to `https://api.housieghar.in` → **Save** → go to **Deployments** tab → click **⋯** on the latest deployment → **Redeploy** (Vercel does **not** auto-redeploy on env var change, unlike Railway).

**If it fails / edge cases:**

- Vercel shows "Invalid Configuration" on the domain → use exactly the values its Domains screen displays (the apex IP shown there is authoritative if it ever differs from `76.76.21.21`), and complete any TXT verification record it asks for — that also goes into the hPanel DNS editor.
- Certificates stuck on "pending" (Vercel or Railway) → DNS hasn't propagated yet, or a stale record survived step one. `dig +short` each name; if you still see a Hostinger parking IP, the old record wasn't deleted. Fix, wait, retry — no other trick needed.
- You still see the Hostinger parking page intermittently after the switch → caches holding the old answer mixed with the new one. It clears within the old record's TTL (Hostinger's defaults can be long); nothing to fix.
- hPanel refuses a record ("record already exists" / validation error) → there's a leftover conflicting record of another type on the same name — e.g. an `AAAA` on `@` pointing at parking. Delete it; don't leave an IPv6 record aimed at the old host or some visitors will land on parking.
- **No CDN in this setup, by design:** SSE and Socket.io traffic go straight to Railway, so there's nothing in the path to buffer the live stream — one whole class of Cloudflare problems gone. The trade-off is no DDoS shield in front of the API; if you ever want one, see the Cloudflare note in Step 3's edge cases (and keep `api` DNS-only when you do).
- Skipping the two env updates + redeploys at the end of this step is the single most common cause of "CORS error on launch day". Do them now, not later.

---

## 9. Wire up Railway's autodeploy + wait-for-CI (not "deploy hooks")

> ⚠️ **Correction (2026-07-09): Railway does not have a "Deploy Hooks" feature.** Earlier drafts of this manual (and `ci.yml`'s `deploy-staging`/`deploy-production` jobs) assumed Railway's Settings tab has a section that mints a URL you `curl -X POST` to trigger a redeploy. That feature does not exist — it's an open, unimplemented request on Railway's own feedback board (2+ upvotes, no ETA, as of this writing). If you've been looking for it and can't find it, that's why.
>
> The good news: what CI/CD actually needs is simpler than a webhook, and Railway already does most of it natively.

**How Railway deploys actually work today:**

1. **Autodeploy is already on.** The GitHub Repo service you connected in Step 4 redeploys automatically on every push to the branch it's watching (you picked that branch when you added the service) — nothing to configure, no secret, no curl. This has been true since Step 4; Steps 5–8 already relied on it (every variable/domain change you made triggered a redeploy).
2. **Gate it on your CI passing, so a red build never ships.** Railway service → **Settings** tab → **Source** section → find the **Wait for CI** toggle → turn it on. With it on, Railway holds the deploy until the GitHub commit status for that SHA is green — i.e. until `ci.yml`'s `verify` job (`Test · Lint · Build`) passes. A failing test now blocks production the same way branch protection blocks a bad merge.
3. **Same toggle on Postgres/Redis isn't a thing** — it's per deploy-triggering service, so only your backend (and frontend, if you also deployed it on Railway instead of Vercel) needs it.
4. **Want a real staging environment?** Two options, in order of how "native" they are:
   - **Railway Environments** (Project → **Environments** dropdown near the project name → **+ New Environment**) — duplicates your service config into a second environment you can point at the `staging` branch, with its own variables and its own domain. This is Railway's own primary answer to "staging," not a second deploy hook.
   - **PR Environments** (Project **Settings → Environments** → enable **PR Environments**) — Railway spins up a full temporary environment for every open pull request and tears it down on merge/close. For a solo-maintainer repo this can replace a persistent `staging` branch entirely: open a PR, get a real preview URL, merge, it's gone.
5. Manually need to force a deploy right now without pushing a commit? Command Palette (**Cmd/Ctrl+K**) → **Deploy Latest Commit** — no hook required for this either.

**What this means for `ci.yml` (not edited here — flagging for you to decide):** the `deploy-staging` / `deploy-production` jobs that curl `RAILWAY_STAGING_DEPLOY_HOOK` / `RAILWAY_PRODUCTION_DEPLOY_HOOK` will fail every run (missing secrets → curl errors) because that mechanism was never real. Once Wait for CI is on, those jobs are redundant anyway — Railway is already refusing to deploy a red commit on its own. Simplest fix: delete the two `curl` steps (keep the health-check step if you still want a post-deploy assertion, or move it to a `workflow_run` trigger). Say the word and this can be done in the same session.

**If it fails / edge cases:**

- **Wait for CI doesn't appear in Settings** → it only shows once Railway has seen at least one GitHub commit-status check on the connected repo. Push any commit (or open a throwaway PR) so `ci.yml`'s `verify` job reports a status, then check again.
- **Deploys still happen on a red commit** → Wait for CI keys off the **commit status API**, which requires the workflow to actually report back to GitHub (the default `actions/checkout` + standard job structure in `ci.yml` already does this — no extra step needed). If it's still not gating, confirm the toggle is on for the correct service *and* the correct branch is the one CI is running against.
- **Two services (or a service + a duplicated environment) both watching the same branch** double-deploy on every push — same failure mode as before, just without a hook in the picture. Confirm only one deploy target per branch.
- **You genuinely need an externally-triggered redeploy** (e.g. a CMS webhook, a cron, a Slack bot) — since there's no per-service hook URL, use the Railway **Public API** (GraphQL, authenticated with a project token from Railway → account **Settings → Tokens**) to call the deploy mutation, or trigger it via `railway up`/`railway redeploy` from the Railway CLI in whatever external system needs it. This is more setup than a hook would have been, which is exactly why it's worth confirming you actually need it before building it.

---

## 10. Enable branch protection on `main`

**GitHub → repo → Settings → Branches → Add rule** for `main`:

- ✅ Require a pull request before merging
- ✅ Require status checks to pass before merging → select **Test · Lint · Build**
- ✅ Require branches to be up to date before merging
- ✅ Do not allow bypassing the above settings

**If it fails / edge cases:**

- The **Test · Lint · Build** checks don't appear in the picker → GitHub only lists checks that have run at least once. Push any commit (or open a throwaway PR) so CI runs, then come back.
- Locked out of a hot-fix because "required status checks have not passed" → the rule is working. For a genuine emergency, temporarily add yourself under "Allow specified actors to bypass", merge, then **remove yourself again** — don't ship with bypass enabled.
- Solo-maintainer reality check: "Require a pull request" applies to you too. From this point on, work lands on `main` via branches + PRs — including the current `frontend-v2-housieghar` work, which should be merged **before** enabling this rule to spare yourself the first fight with it.

---

## 11. Set up Sentry error tracking (~10 minutes)

> ✅ **All code is already done — backend and frontend.** `@sentry/node` init is guarded in `src/server.ts`; `@sentry/nextjs` is wired via `src/instrumentation.ts` (server, incl. `onRequestError`) and `src/instrumentation-client.ts` (browser). Both no-op until the DSN env vars exist, so all that's left is accounts + variables. (The wizard is NOT needed; run it later only if you want source-map upload for readable stack traces.)

1. Sign up at [sentry.io](https://sentry.io) → free Developer plan covers this project easily.
2. **Projects → Create Project → Node.js** → name it `housieghar-backend`. Copy the DSN.
3. In Railway Variables, add:

   | Variable | Value |
   |---|---|
   | `SENTRY_DSN` | The DSN from the Node.js project |

4. **Projects → Create Project → Next.js** → name it `housieghar-frontend`. In Vercel Environment Variables, add:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_SENTRY_DSN` | The DSN from the Next.js project |
   | `SENTRY_DSN` | Same DSN (server-side rendering errors) |

   Redeploy the frontend after adding them (`NEXT_PUBLIC_*` vars bake in at build time).

**If it fails / edge cases:**

- Backend events never arrive → `SENTRY_DSN` is read **once at boot** (`process.env` check at the top of `server.ts`), so the service must restart after the variable is added — Railway does this automatically on variable change; if in doubt, redeploy manually.
- Browser events missing while server events arrive → ad-blockers eat Sentry's ingest requests. Test in a clean private window with extensions off before assuming the wiring is broken. And remember `NEXT_PUBLIC_SENTRY_DSN` only takes effect after a Vercel rebuild.
- Stack traces are minified gibberish (`a.b at chunk-xyz.js:1:48211`) → that's the missing source-map upload, cosmetic only. Run the Sentry wizard later if you want readable frames; nothing else depends on it.
- Zero events ever, even on a forced test error → check the DSN was pasted whole (it's one long URL, easy to truncate) and that you didn't swap the backend/frontend DSNs — events land in the wrong project rather than nowhere, so check both projects' inboxes.

---

## 12. Set up UptimeRobot (~5 minutes)

1. Sign up at [uptimerobot.com](https://uptimerobot.com) → free tier monitors every 5 minutes.
2. **Add New Monitor:**
   - Type: **HTTP(S)**
   - URL: `https://api.housieghar.in/health`
   - Interval: 5 minutes
   - Alert contacts: your email + mobile number
3. Add a second monitor for the frontend: `https://housieghar.in`

Do this before you invite a single user.

**If it fails / edge cases:**

- Monitor shows **down** while the site works in your browser → you created it before Step 8 finished. UptimeRobot checks from outside your machine's DNS cache: `dig api.housieghar.in +short` must resolve and the certificate must be valid before the monitor can go green.
- Don't monitor an authenticated path — it would 401 and page you at 3 a.m. for nothing. `/health` is deliberately unauthenticated; the frontend monitor on `/` is fine because the login redirect still returns a healthy HTTP response.
- Rate limits are not a concern: a 5-minute monitor is 3 requests per 15-minute window against a 100-request limit.
- The frontend monitor going red while `/health` stays green means Vercel (or the `@`/`www` DNS records) broke — that split tells you *which half* to debug before you even open a dashboard.

---

## 13. Rotate all seeded staff passwords

The dev seed creates every staff account with the password `ChangeMe123!` — this is public knowledge in the repo. **In production you should never run `npm run seed` at all** (use `seed:prod`, which creates only the Superadmin — and the app forces a password change on its first login).

The app now enforces rotation wherever `temp_password_required` is set: the account is locked to a change-password screen (every other staff API returns 403) until a real password is chosen. That covers the `seed:prod` Superadmin, staff created through the admin UI, and admin-reset passwords (`PATCH /api/users/:id` with a `password` re-flags temp).

If dev-seeded accounts ever made it into a database you're promoting: log in as each (`superadmin`, `cfo`, `operator`, `bookie1-3`) and change its password, or delete and re-create them via the admin UI. No `ChangeMe123!` may survive to production.

**If it fails / edge cases:**

- **Locked out of the only Superadmin** (forgot the password you set at the forced change — `seed:prod` will *not* rescue you, it skips whenever a Superadmin exists): recover through the database. Generate a bcrypt hash via `railway ssh` into the backend service (Step 6a):

  ```bash
  node -e "require('bcrypt').hash(process.argv[1], 12).then(h => console.log(h))" 'TempReset123!'
  ```

  then run this against Postgres via `railway connect` (Railway CLI → `railway connect` → pick the Postgres service → drops you into a real `psql` shell; the dashboard's own SQL query tab is behind a feature flag most accounts don't have enabled, so the CLI is the reliable path):

  ```sql
  UPDATE Users SET password_hash = '<paste the hash>', temp_password_required = TRUE
  WHERE email = 'your-superadmin@email';
  ```

  Log in with `TempReset123!` — the app forces you straight onto the change-password screen again, so the throwaway value never survives.
- The change-password screen rejects your new password → it must be at least 8 characters and different from the current one; the API also re-verifies the current password, so a typo there reads as "wrong password", not a validation hint.
- A staff account that somehow has a known/shared password but **no** temp flag → reset it via the Workforce UI (`PATCH /api/users/:id` with a new password) — that re-flags `temp_password_required`, forcing them to choose their own on next login. You cannot reset your own account this way (the API blocks it); use a second admin or the SQL above.
- Suspended a user and they seem to still be active → they aren't: `authenticateToken` re-checks the DB on **every request**, so a live cookie dies on their very next API call. What you're seeing is a stale page render; any action they take will 403.

---

## 14. Scan git history for committed secrets

> ✅ **The scan has already been run** — `gitleaks` flagged only placeholder PEM text in `HG/.env.example` and `PDR.md`; no real secret was committed, so there is nothing to rotate or scrub. The commands below are kept for re-running the scan later.

```bash
brew install gitleaks
gitleaks detect --source . --verbose
```

If anything is flagged: **rotate the credential first** (it is already compromised), then scrub the history:

```bash
pip install git-filter-repo
git filter-repo --path HG/.env --invert-paths
git push origin --force --all
```

**If it fails / edge cases:**

- New findings that are placeholder/example text (like the two known hits) → add their fingerprints to a `.gitleaksignore` instead of rewriting history. Rewrite only for **real** credentials.
- Rotate the leaked credential **before** scrubbing, not after — anyone who already fetched the repo has it; history rewriting doesn't un-leak.
- If you do run `git filter-repo`, three things will surprise you: it **deletes the `origin` remote** as a safety measure (re-add it before pushing), the force-push is **blocked by Step 10's branch protection** (temporarily lift the rule, push, restore it), and every collaborator must **re-clone** — an old clone will quietly reintroduce the scrubbed commits on its next push.
- Also invalidate any caches that hold the old history: existing forks and GitHub's own cached views (contact GitHub support for full purge if the secret was truly sensitive).

---

## 15. Fix npm audit vulnerabilities

> ✅ **Done (2026-07-02) — both packages report 0 vulnerabilities.**

What was fixed:

- **Backend — 3 high** (`ws` memory-exhaustion DoS via engine.io → socket.io-adapter): resolved by `npm audit fix`, no breaking changes.
- **Frontend — 2 high** (same `ws` chain via socket.io-client): resolved by `npm audit fix`.
- **Frontend — 2 moderate** (`postcss` `</style>` XSS in the copy *nested inside Next.js* — `npm audit`'s suggested "fix" was a nonsense downgrade to next@9): resolved by lifting the nested copy with an npm override, kept in `HG/frontend/package.json`:

```json
"overrides": { "postcss": "^8.5.10" }
```

`npm run build` and `npm run lint` verified green after all fixes. Before launch day, re-run in both packages to catch newly published CVEs:

```bash
cd HG/backend  && npm audit --audit-level=moderate
cd HG/frontend && npm audit --audit-level=moderate
```

**If it fails / edge cases:**

- A new CVE appears with no clean fix → first check whether it's even runtime-reachable: `npm audit --omit=dev`. A vulnerability confined to devDependencies (build tooling, test runners) cannot affect the deployed app — note it and move on.
- **Never run `npm audit fix --force` in the frontend.** Its idea of a "fix" for the nested-postcss finding was downgrading to `next@9`. Plain `npm audit fix` is fine; `--force` is how you destroy a working lockfile the night before launch.
- Don't delete the `"overrides": { "postcss": "^8.5.10" }` entry "because audit is clean" — it is *why* audit is clean. Remove it only once Next itself ships postcss ≥ 8.5.10.
- After any dependency change, re-run the full gates before deploying: backend `npm run build && npm test`, frontend `npm run lint && npm run build`. An audit fix that breaks the build is worse than the CVE it patched.

---

## 16. First smoke-test in production

Run the full booking flow manually after deploy:

1. Register a player at `https://housieghar.in/login`.
2. Browse games, select tickets, lock a booking.
3. Confirm the dev-bypass endpoint is **blocked** — `POST /api/bookings/:id/dev-bypass` must return 404 in production. (This is the real route path; an earlier draft of this checklist said `dev-bypass-confirm`, which never existed, so the check passed vacuously.)
4. Have a bookie confirm via the staff dashboard.
5. Watch the live board — SSE draws should appear in real time.
6. Verify the winner overlay and the Hall of Fame update correctly.

If something breaks, check the Railway Deploy Logs tab (structured Pino JSON). On Vercel, check Function Logs under the deployment.

**If it fails — symptom → first move:**

| Symptom | Likely cause | Fix |
|---|---|---|
| Login does nothing, or you're logged out on refresh | Testing on the temporary `vercel.app` / `railway.app` URLs — SameSite cookies are dropped cross-site | Test on the real domain only (Step 7's edge cases explain why) |
| CORS errors in the browser console | `FRONTEND_URL` mismatch — scheme, `www`, or a trailing slash | Fix the Railway variable (Step 6); it redeploys automatically |
| Live board connects but never updates | Something in the path is buffering the SSE stream — with plain Hostinger DNS there's no proxy, so suspect a later-added CDN, a corporate/ISP proxy, or a VPN on the test device | `curl -N https://api.housieghar.in/api/games/<id>/live-stream` — if events print in real time the server is fine and the problem is on the client's network; if you added Cloudflare, set `api` to DNS-only |
| Bookie/staff dashboards never receive live bookings | Same `FRONTEND_URL` origin check (Socket.io), or a wrong `NEXT_PUBLIC_API_URL` | Verify both variables; sockets connect directly to `api.housieghar.in`, not through Vercel |
| Every request returns 429 | The global limiter is 100 requests / 15 min **per IP** — one office NAT or hostel Wi-Fi can trip it | Acceptable on day one; if it bites real users, raise the global `max` in `app.ts` and redeploy |
| Every API call 500s | Read the actual Pino error in Railway logs before guessing | `Missing required environment variable` → Step 6; PEM/`secretOrPrivateKey` errors → Steps 1 & 6 |
| Winner overlay fine, but the bookie's "prize owed" card never appears | `prize_owed` is a Socket.io event to the agent's room | Same Socket.io checklist as the dashboards row above |

One code-level pre-launch check that belongs to this step: the strict **auth rate limiter is currently commented out** in `HG/backend/src/app.ts` (the two `app.use('/api/auth/login', …)` / `('/api/players/login', …)` lines). Re-enable it before real users arrive — without it, staff passwords can be brute-forced at 100 attempts per 15 minutes instead of 5.

---

## Appendix A: Self-hosted VPS (DigitalOcean Droplet)

Use this path only if you prefer a VPS over Railway. The `ecosystem.config.js` (PM2) and `HG/nginx/nginx.conf` files in the repo are written for this setup.

> **Hosting on a Hostinger VPS instead?** Don't use this appendix — `host.md` is a complete, Hostinger-specific version of this whole guide (hPanel setup, firewall, DNS, nginx, PM2, troubleshooting) and supersedes the sketch below.

**Recommended Droplet:** Basic, 2 GB RAM, 1 vCPU, Ubuntu 24.04 LTS (~$12/month). Add a $15/month managed Postgres cluster and a $10/month managed Redis cluster from the DigitalOcean marketplace. Total: ~$37/month — more expensive than Railway, but you control the infrastructure.

### PM2 setup

```bash
npm install -g pm2

# First deploy
cd HG/backend && npm run build && npm run migrate
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup    # run the printed command to enable auto-start on reboot

# Log rotation (prevents disk fill)
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true

# Subsequent zero-downtime deploys
cd HG/backend && npm run build && npm run migrate
pm2 reload ecosystem.config.js --env production
```

### nginx and TLS

The `HG/nginx/nginx.conf` is structurally correct. After install:

```bash
sudo apt install nginx certbot python3-certbot-nginx
sudo certbot --nginx -d housieghar.in -d www.housieghar.in -d api.housieghar.in
sudo certbot renew --dry-run    # confirm auto-renewal
sudo nginx -t && sudo systemctl reload nginx
```

Add the HTTP→HTTPS and www→non-www redirect blocks that Certbot does not add automatically:

```nginx
server {
    listen 80;
    server_name housieghar.in www.housieghar.in api.housieghar.in;
    return 301 https://$host$request_uri;
}
```

### Firewall

```bash
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP (cert renewal + redirect)
sudo ufw allow 443   # HTTPS
sudo ufw enable
```
