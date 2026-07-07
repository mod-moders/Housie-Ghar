# Housie Ghar — Manual Launch Steps

---

## What's left — all manual

The AI-doable parts are already complete:

- **CI/CD** — `.github/workflows/ci.yml` is fully wired: deploy-hook jobs for `main` / `staging` plus the `https://api.housieghar.in/health` post-deploy check.
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
| 3 | Buy domain on Cloudflare | Account creation and payment. |
| 4 | Create Railway project | Account creation and the Railway UI. |
| 5 | Configure Railway service settings | Railway UI — root directory, build / start / pre-deploy commands. |
| 6 | Set environment variables in Railway | Security-sensitive; production JWT keys, DB URLs, and passwords must never touch an AI session. |
| 7 | Deploy frontend to Vercel | Vercel account creation and UI setup. |
| 8 | DNS records in Cloudflare | Cloudflare dashboard access. |
| 9 | CI/CD deploy hooks | **`ci.yml` already wired.** Generate the Railway deploy-hook URLs, then add `RAILWAY_PRODUCTION_DEPLOY_HOOK` / `RAILWAY_STAGING_DEPLOY_HOOK` to GitHub Secrets. |
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
| DNS + CDN + DDoS | Cloudflare (free plan) | $0/month |
| Domain | Cloudflare Registrar | ~$10/year |
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

## 3. Buy your domain on Cloudflare Registrar

1. Go to [cloudflare.com](https://cloudflare.com) → sign up for a free account.
2. **Registrar → Register Domains** → search for `housieghar.in` (or your chosen domain).
3. Cloudflare Registrar sells at cost with no markup (~$10–13/year for `.in`). You also get free CDN, DDoS protection, and DNS management automatically.
4. Add the domain to your account. You'll point it at Railway and Vercel in Step 8.

**If it fails / edge cases:**

- **Already own the domain — e.g. registered at Hostinger?** Skip the purchase entirely. Two ways to proceed:
  1. **Recommended:** add the domain to Cloudflare's free plan (**Add a site** — no transfer, registration stays at Hostinger, $0). Cloudflare shows you two nameservers; in Hostinger hPanel go to **Domains → (your domain) → DNS / Name Servers → Change nameservers** and replace Hostinger's with those two. Cloudflare emails you when it goes active (usually under an hour, up to 24h).
  2. Keep DNS at Hostinger and create Step 8's records in hPanel instead — see the Hostinger note inside Step 8's edge cases.
- Cloudflare stuck on "Pending nameserver update" → confirm you replaced **both** nameservers and removed the old ones; verify with `dig NS yourdomain.in +short` (must show only Cloudflare's pair).
- Domain is brand new and pages 404 randomly for a while → old parking-page records are still cached; lower TTLs can't fix caches that already hold the old answer. It clears within the old record's TTL.
- Want to host everything on a **Hostinger VPS** instead of Railway + Vercel? That's a different (single-server) architecture — follow `host.md`, not this file.

---

## 4. Create a Railway project

1. Sign up at [railway.app](https://railway.app) → choose the **Hobby plan** ($5/month base, plus usage).
2. **New Project → Empty Project**.
3. Inside the project, click **+ New** three times to add:
   - **Postgres** plugin (railway provisions it automatically)
   - **Redis** plugin (railway provisions it automatically)
   - **GitHub Repo** → connect your repository → select the `main` branch

The Postgres and Redis plugins automatically inject `DATABASE_URL` and `REDIS_URL` into any service in the same project. You do not need to copy-paste those values.

**If it fails / edge cases:**

- Your repo doesn't appear in the picker → the Railway GitHub App was never granted access to it. GitHub → **Settings → Applications → Railway → Configure** → grant the `Housie-Ghar` repo (an org-owned repo needs an org admin to approve).
- `DATABASE_URL` / `REDIS_URL` come up empty in the backend service → the plugins and the service must live in the **same project and environment**. If you created them elsewhere, use Railway's variable references instead of copy-pasting connection strings.
- Selecting the branch: the service deploys whatever branch you pick here. If the launch code lives on `frontend-v2-housieghar` and hasn't been merged, either merge to `main` first (recommended — CI and branch protection are wired for `main`) or point the service at that branch and remember Step 9's hooks also deploy that branch.

---

## 5. Configure the Railway backend service

In the GitHub Repo service settings:

**General:**
- **Root Directory:** `HG/backend`

**Build & Deploy:**
- **Build Command:** `npm ci && npm run build`
- **Start Command:** `npm start`
- **Pre-Deploy Command:** `npm run migrate`

The pre-deploy command runs `ts-node src/db/migrate.ts` before every deploy, keeping the schema up to date without manual intervention.

**Networking:**
- Click **Generate Domain** to get a `*.up.railway.app` URL. Note it down — you'll use it as `NEXT_PUBLIC_API_URL` in Vercel and as the health check URL in the CI workflow.
- Later, add your custom domain `api.housieghar.in` here (Step 8).

**If it fails / edge cases:**

- Build fails `tsc: not found` — or the pre-deploy migrate fails `ts-node: not found` → devDependencies got pruned. Add the variable `NPM_CONFIG_PRODUCTION=false` and redeploy; both the compiler and the migration runner live in devDependencies.
- "Could not find package.json" / instant build failure → **Root Directory** must be exactly `HG/backend` — case-sensitive, no leading or trailing slash.
- Pre-deploy migrate fails with `ENOTFOUND postgres.railway.internal` or `ECONNREFUSED` → the Postgres plugin isn't in this environment, or someone overrode `DATABASE_URL` manually. Delete the manual value and let the plugin inject it.
- First deploy crash-loops with `Missing required environment variable: …` → **expected** until Step 6's variables exist (`config/env.ts` throws on any missing var at boot). Do Steps 5 and 6 back-to-back and only then judge the deploy.
- Deploys are slow or rebuild with no changes → confirm only one service watches the repo; two services watching the same repo double-deploy on every push.

---

## 6. Set environment variables in Railway

In the backend service → **Variables tab**, add each variable individually. Do **not** paste a raw `.env` file — Railway stores each value encrypted.

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `4000` |
| `DATABASE_URL` | Auto-injected by the Postgres plugin — do not set manually |
| `REDIS_URL` | Auto-injected by the Redis plugin — do not set manually |
| `JWT_PRIVATE_KEY` | From Step 1 — the full private key. Railway accepts multi-line values: paste the PEM block as-is |
| `JWT_PUBLIC_KEY` | From Step 1 — the full public key (same format) |
| `FRONTEND_URL` | `https://housieghar.in` — exact scheme + host, no trailing slash. Use the Vercel domain until your custom domain is set up, then update it. |
| `SUPERADMIN_EMAIL` | A real monitored mailbox |
| `SUPERADMIN_TEMP_PASSWORD` | A strong random value — rotate it on first login |
| `JWT_EXPIRY` | `8h` |

After adding all variables, Railway will redeploy automatically. Watch the **Deploy Logs** tab for the Pino startup message confirming the server is listening on port 4000.

**If it fails / edge cases:**

- Paste PEM values **without** surrounding double quotes — quotes are `.env`-file syntax, not part of the key. Railway stores the raw multi-line value.
- Logins 500 and the logs show `secretOrPrivateKey must be an asymmetric key` or `error:0909006C:PEM routines` → a PEM got mangled: missing `BEGIN/END` line, trailing whitespace, or a partial paste. Re-paste both keys from the original files (Step 1's edge cases cover verifying the pair).
- `FRONTEND_URL` is the most error-prone value in this table: exact scheme + host, **no trailing slash**. The backend splits it on commas, so covering both apex and www is `https://housieghar.in,https://www.housieghar.in`. Symptom when wrong: pages render fine, but every login dies with a CORS error in the browser console and staff dashboards never receive live events (Socket.io checks the same origin list).
- Boot log shows a Redis or Postgres connection error rather than the Pino "running" line → you set `DATABASE_URL`/`REDIS_URL` manually and broke the plugin injection. Delete the manual values.
- Changing a variable here redeploys the **backend** only. Frontend `NEXT_PUBLIC_*` values (Step 7) bake in at build time and need a Vercel redeploy separately.

### 6a. One-time production bootstrap (after the first successful deploy)

A freshly migrated database has no Roles and no Superadmin — the app boots but nobody can log in. In the Railway backend service, open the **shell/one-off command** runner and execute:

```bash
npm run seed:prod
```

It is idempotent (safe to re-run) and creates only: the four Roles, `Platform_Config` defaults, and one Superadmin from `SUPERADMIN_EMAIL` + `SUPERADMIN_TEMP_PASSWORD` with `temp_password_required = TRUE`. It **refuses** to run in production while those two variables still hold the dev defaults. On your first login the app forces you to set a real password.

**If it fails / edge cases:**

- `relation "roles" does not exist` → migrations never ran (Step 5's pre-deploy command is missing or failed). Run `npm run migrate` in the same shell, then re-run `seed:prod`.
- `Refusing to bootstrap production with dev defaults` → set real `SUPERADMIN_EMAIL` + `SUPERADMIN_TEMP_PASSWORD` in Variables first. This refusal is a feature.
- Re-running is always safe, but know its limit: if **any** Superadmin already exists it skips creation entirely. Changing `SUPERADMIN_EMAIL` later and re-running does **not** create a second account, rename the first, or reset a password. Locked out? Use the database recovery in Step 13's edge cases.
- Ran `npm run seed` by mistake → it throws immediately in production and writes nothing. Only `seed:prod` is production-safe.

---

## 7. Deploy the frontend to Vercel

1. Go to [vercel.com](https://vercel.com) → sign up with your GitHub account.
2. **Add New → Project → Import Git Repository** → select the Housie Ghar repo.
3. Set these overrides before deploying:

| Setting | Value |
|---|---|
| **Root Directory** | `HG/frontend` |
| **Framework Preset** | Next.js (auto-detected) |
| **Build Command** | `npm run build` (default) |
| **Output Directory** | `.next` (default) |

4. Add one environment variable:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | Your Railway backend URL — e.g. `https://housieghar-backend-production.up.railway.app` (the Railway-generated domain from Step 5). Update to `https://api.housieghar.in` after Step 8. |

5. Click **Deploy**. Vercel builds and deploys in ~2 minutes. The generated URL will be `housieghar.vercel.app` until you attach the custom domain.

**If it fails / edge cases:**

- "No Next.js version detected" → **Root Directory** wasn't set to `HG/frontend` before the first build. Fix it in Project Settings and redeploy.
- `NEXT_PUBLIC_API_URL` must have **no trailing slash** — the frontend concatenates `${BASE}${path}`, so a trailing slash yields `//api/...` URLs that 404. All three transports (fetch, the SSE `EventSource`, and Socket.io) read this one variable.
- **Login looks broken on the temporary `*.vercel.app` URL — expected, don't debug it.** The auth cookies are SameSite-restricted (`lax`/`strict`), and `vercel.app` ↔ `up.railway.app` are different *sites*, so the browser refuses to attach them cross-site. It resolves itself in Step 8 when frontend and API share one site (`housieghar.in` + `api.housieghar.in`). Only judge logins after Step 8.
- Changed `NEXT_PUBLIC_API_URL` and nothing happened → it's baked in at build time. Trigger **Deployments → Redeploy** every time it changes.

---

## 8. Point your domain at Railway and Vercel (Cloudflare DNS)

Go to **Cloudflare → your domain → DNS → Records**.

Add these four records:

| Type | Name | Target | Proxy |
|---|---|---|---|
| CNAME | `@` (root) | `cname.vercel-dns.com` | DNS only (grey cloud) — Vercel requires this |
| CNAME | `www` | `cname.vercel-dns.com` | DNS only |
| CNAME | `api` | `<your-railway-domain>.up.railway.app` | Proxied (orange cloud) |

Set TTL to **Auto** (300s). Once DNS propagates (~5 minutes with Cloudflare), continue.

**Attach the custom domains:**

- **Vercel:** Project Settings → Domains → Add `housieghar.in` and `www.housieghar.in`. Vercel auto-issues a Let's Encrypt certificate.
- **Railway:** Backend service → Settings → Networking → Custom Domain → Add `api.housieghar.in`. Railway auto-issues a certificate.

After both are live, update two values:
- In Railway Variables: change `FRONTEND_URL` to `https://housieghar.in`
- In Vercel Environment Variables: change `NEXT_PUBLIC_API_URL` to `https://api.housieghar.in`

Trigger a redeploy on both after updating (Vercel: Deployments → Redeploy; Railway: redeploys automatically on variable change).

**If it fails / edge cases:**

- **Infinite redirect loop** (`ERR_TOO_MANY_REDIRECTS`) → Cloudflare **SSL/TLS mode must be "Full (strict)"**, not "Flexible". Flexible speaks plain HTTP to origins that force HTTPS, which bounces forever.
- Railway's custom-domain certificate stuck on "pending" → temporarily switch the `api` record to **DNS only** (grey cloud) so the ACME challenge reaches Railway directly; re-enable the proxy after it's issued.
- Vercel shows "Invalid Configuration" on the domain → the `@`/`www` records must be **DNS only** exactly as the table says, and complete any TXT verification record Vercel asks for.
- **Live board frozen in production but fine locally** → the Cloudflare proxy on `api` is buffering the SSE stream. Grey-cloud the `api` record and retest; if that fixes it, leave `api` DNS-only permanently (the site keeps Cloudflare's shield, the API connects direct).
- **Kept DNS at Hostinger** (Step 3, option 2)? Create the same records in hPanel's DNS zone editor with one substitution: Hostinger doesn't allow a CNAME on the root, so use an **A record on `@`** pointing at the IP Vercel's Domains screen tells you to use, keep `www` and `api` as CNAMEs. hPanel has no proxy toggle — everything behaves like "DNS only", so the two grey-cloud caveats above never apply.
- Skipping the two env updates + redeploys at the end of this step is the single most common cause of "CORS error on launch day". Do them now, not later.

---

## 9. Wire up CI/CD deploy hooks

> ✅ **The `ci.yml` edits are already done and committed** — the deploy-hook jobs and the `api.housieghar.in` health check are in place. Only the Railway-hook generation and the GitHub Secrets below remain.

In Railway: backend service → Settings → **Deploy Hooks** → Generate a deploy hook URL for the `main` branch and another for a `staging` branch (create the staging service separately if you want one).

Go to **GitHub → repo → Settings → Secrets and variables → Actions** and add:

| Secret name | Value |
|---|---|
| `RAILWAY_PRODUCTION_DEPLOY_HOOK` | The deploy hook URL for your production service |
| `RAILWAY_STAGING_DEPLOY_HOOK` | The deploy hook URL for staging (or duplicate the production value if you have only one environment) |

Once added, every push to `main` will typecheck, lint, build, then trigger the Railway deploy hook automatically.

**If it fails / edge cases:**

- CI goes green but nothing deploys → secret-name typo. The workflow reads exactly `RAILWAY_PRODUCTION_DEPLOY_HOOK` and `RAILWAY_STAGING_DEPLOY_HOOK` — check for stray spaces or different casing.
- The hook URL returns 401/404 when curled → it was regenerated or revoked in Railway. Generate a new one and update the GitHub secret; the old URL dies immediately.
- A deploy hook deploys **the branch the Railway service is configured on**, regardless of which branch triggered CI. If the service watches `main` but you pushed elsewhere, the hook still redeploys `main` — harmless, but it can look like "my change didn't deploy".
- No staging service? Duplicating the production hook into `RAILWAY_STAGING_DEPLOY_HOOK` (as the table suggests) means a `staging`-branch push deploys **production**. If that's not what you want, leave the staging secret unset and let that job fail instead.

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

- **Locked out of the only Superadmin** (forgot the password you set at the forced change — `seed:prod` will *not* rescue you, it skips whenever a Superadmin exists): recover through the database. Generate a bcrypt hash in the Railway backend shell:

  ```bash
  node -e "require('bcrypt').hash(process.argv[1], 12).then(h => console.log(h))" 'TempReset123!'
  ```

  then run this against Postgres (Railway → Postgres service → Data/Query tab):

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
| Live board connects but never updates | The SSE stream is being buffered by the Cloudflare proxy on `api` | Grey-cloud the `api` record (Step 8's edge cases) |
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
