# Housie Ghar — Manual Launch Steps

---

## What's left — all manual

The AI-doable parts are already complete:

- **CI/CD** — `.github/workflows/ci.yml` is fully wired: deploy-hook jobs for `main` / `staging` plus the `https://api.housieghar.in/health` post-deploy check.
- **Sentry (backend)** — `@sentry/node` installed; a guarded `Sentry.init` added at the top of `src/server.ts` (no-op until `SENTRY_DSN` is set). Backend typechecks clean.
- **Secret scan** — `gitleaks` run across all 88 commits; the only two hits are placeholder PEM text in `HG/.env.example` and `PDR.md`, so no real key was ever committed.
- **Dependency audit** — `npm audit --audit-level=high` run in both packages (see Step 15 for the findings).

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
| 11 | Frontend Sentry + DSNs | **Backend Sentry already done.** Create the Sentry projects, run the interactive `npx @sentry/wizard@latest -i nextjs` (needs Sentry login), then add `SENTRY_DSN` to Railway and `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` to Vercel. |
| 12 | Set up UptimeRobot | UptimeRobot account creation and UI setup. |
| 13 | Rotate seeded staff passwords | Log into the live app as each seeded staff user and change the password. |
| 14 | Review the gitleaks scan | **Already run — both hits are placeholder text, nothing leaked.** No credential rotation or history scrub needed; optionally add a `.gitleaksignore`. |
| 15 | Fix npm audit vulnerabilities | **3 high in backend, 2 moderate + 2 high in frontend** (all `ws` via socket.io chain). Run `npm audit fix` in both packages — see Step 15 for the exact commands and caveats. |
| 16 | First smoke-test in production | A browser session against the live production URL. |

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

---

## 3. Buy your domain on Cloudflare Registrar

1. Go to [cloudflare.com](https://cloudflare.com) → sign up for a free account.
2. **Registrar → Register Domains** → search for `housieghar.in` (or your chosen domain).
3. Cloudflare Registrar sells at cost with no markup (~$10–13/year for `.in`). You also get free CDN, DDoS protection, and DNS management automatically.
4. Add the domain to your account. You'll point it at Railway and Vercel in Step 8.

---

## 4. Create a Railway project

1. Sign up at [railway.app](https://railway.app) → choose the **Hobby plan** ($5/month base, plus usage).
2. **New Project → Empty Project**.
3. Inside the project, click **+ New** three times to add:
   - **Postgres** plugin (railway provisions it automatically)
   - **Redis** plugin (railway provisions it automatically)
   - **GitHub Repo** → connect your repository → select the `main` branch

The Postgres and Redis plugins automatically inject `DATABASE_URL` and `REDIS_URL` into any service in the same project. You do not need to copy-paste those values.

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

---

## 10. Enable branch protection on `main`

**GitHub → repo → Settings → Branches → Add rule** for `main`:

- ✅ Require a pull request before merging
- ✅ Require status checks to pass before merging → select **Test · Lint · Build**
- ✅ Require branches to be up to date before merging
- ✅ Do not allow bypassing the above settings

---

## 11. Set up Sentry error tracking (~15 minutes)

> ✅ **Backend code is already done** — `@sentry/node` is installed and the guarded `Sentry.init` is in `src/server.ts` (item 4 below). You still need the Sentry account + DSN (items 1–3), the frontend wizard (item 5), and to add the DSNs to Railway/Vercel.

1. Sign up at [sentry.io](https://sentry.io) → free Developer plan covers this project easily.
2. **Projects → Create Project → Node.js** → name it `housieghar-backend`. Copy the DSN.
3. In Railway Variables, add:

   | Variable | Value |
   |---|---|
   | `SENTRY_DSN` | The DSN from the Node.js project |

4. **Projects → Create Project → Next.js** → name it `housieghar-frontend`. Then run:

   ```bash
   cd HG/frontend && npx @sentry/wizard@latest -i nextjs
   ```

   Accept all prompts. Add the frontend DSN to Vercel as `NEXT_PUBLIC_SENTRY_DSN` (public) and `SENTRY_DSN` (private).

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

---

## 13. Rotate all seeded staff passwords

The seed creates every staff account with the password `ChangeMe123!` — this is public knowledge in the repo. Before going live:

1. Log into `/staff` as each seeded account in turn: `superadmin`, `cfo`, `operator`, `bookie1`, `bookie2`, `bookie3`.
2. Update the password to a strong unique value through the Admin UI.

Alternatively, delete and re-create the accounts with secure passwords. Either way, no seeded default password should survive to production.

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

---

## 15. Fix npm audit vulnerabilities

Both packages were audited (`npm audit --audit-level=high`). All findings are the same root cause: a memory-exhaustion DoS in the `ws` package, pulled in transitively by socket.io / socket.io-client. No user data or auth is at risk — this is a server availability concern.

**Backend — 3 high** (ws → engine.io → socket.io-adapter):

```bash
cd HG/backend && npm audit fix
```

`npm audit fix` resolves all 3 without breaking changes — safe to run.

**Frontend — 2 moderate + 2 high** (ws → engine.io-client → socket.io-client):

```bash
cd HG/frontend && npm audit fix
```

This fixes the 2 high. The 2 moderate may remain after a plain `fix`; if so, `npm audit fix --force` resolves them but may introduce breaking changes — review the diff before committing. If the force-fix breaks the build, pin `ws` directly in `package.json` overrides instead:

```json
"overrides": { "ws": "^8.18.0" }
```

then run `npm install` and verify `npm run build` and `npm run lint` still pass.

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

---

## Appendix A: Self-hosted VPS (DigitalOcean Droplet)

Use this path only if you prefer a VPS over Railway. The `ecosystem.config.js` (PM2) and `HG/nginx/nginx.conf` files in the repo are written for this setup.

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
