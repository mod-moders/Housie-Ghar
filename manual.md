# Housie Ghar — Manual Launch Steps

Everything in this file requires a human (account creation, secrets that must never touch the filesystem, external dashboards). Work through these in order.

---

## 1. Generate production RSA keypair

These keys sign every JWT. The dev keys may have been seen by AI tools — generate fresh ones for production.

```bash
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
```

Copy the content of each file into your host's secret store (not onto disk on the server) as single-line `\n`-escaped strings. Shred the local PEM files after:

```bash
shred -u private.pem public.pem
```

---

## 2. Generate CI-only RSA keypair and add it to GitHub Secrets

The CI workflow needs keys so that `env.ts` doesn't throw during `tsc` and `build`. These are throwaway keys — never use them in production.

```bash
openssl genrsa -out ci-private.pem 2048
openssl rsa -in ci-private.pem -pubout -out ci-public.pem
```

In your GitHub repo → **Settings → Secrets and variables → Actions**, add:

| Secret name | Value |
|---|---|
| `CI_JWT_PRIVATE_KEY` | Contents of `ci-private.pem` (the full PEM block) |
| `CI_JWT_PUBLIC_KEY` | Contents of `ci-public.pem` (the full PEM block) |

Then delete the local files:

```bash
rm ci-private.pem ci-public.pem
```

---

## 3. Set every environment variable in your host's secret store

Never copy `.env` to the server. Add each variable through your host's UI (Railway/Render/Fly environment settings, or DigitalOcean App Platform environment variables). Minimum required:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Connection string to your production Postgres (non-root user) |
| `REDIS_URL` | Connection string to your production Redis |
| `JWT_PRIVATE_KEY` | From Step 1 — the private key, `\n`-escaped |
| `JWT_PUBLIC_KEY` | From Step 1 — the public key, `\n`-escaped |
| `NODE_ENV` | `production` — **must be set explicitly** |
| `FRONTEND_URL` | `https://yourdomain.com` — exact scheme+host, no trailing slash |
| `SUPERADMIN_EMAIL` | A real monitored mailbox |
| `SUPERADMIN_TEMP_PASSWORD` | A strong random value (rotate it on first login) |
| `JWT_EXPIRY` | `8h` (recommended) |

---

## 4. Provision managed Postgres and Redis

### Postgres
1. Provision managed Postgres 14 (Railway, Supabase, or AWS RDS).
2. Create a least-privilege app user — **not** `postgres`:
   ```sql
   CREATE USER housieghar_app WITH PASSWORD 'strong-password-here';
   GRANT CONNECT ON DATABASE housieghar TO housieghar_app;
   GRANT USAGE ON SCHEMA public TO housieghar_app;
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO housieghar_app;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO housieghar_app;
   ```
3. Use this user's connection string in `DATABASE_URL`.
4. Enable automated daily backups in the Postgres dashboard. Set retention ≥ 7 days.
5. Do one restore test before accepting any signups:
   ```bash
   # Managed service: use their console restore tool, then inspect row counts
   psql "$DATABASE_URL" -c "SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC;"
   ```

### Redis
Provision managed Redis (Railway, Upstash, or AWS ElastiCache). Paste the URL into `REDIS_URL`.

---

## 5. Run migrations (never seed) in production

```bash
cd HG/backend && npm run migrate
```

Do this as a pre-deploy step, **not** inside app boot. The `seed.ts` script is blocked in production by a guard — never run it.

---

## 6. Set up DNS and HTTPS

1. **Buy your domain** (Cloudflare Registrar recommended — at-cost pricing and you get free CDN/DDoS).
2. **Point DNS at your host:**
   - Managed host (Railway/Render/Fly): add a `CNAME` record to the hostname your host gives you. Use Cloudflare's **CNAME flattening** if you need a root `@` record.
   - Self-hosted Droplet: add `A` records for `@`, `www`, and `api` pointing to your server IP.
3. **Set TTL to 300s** during launch so you can re-point quickly. Raise to 3600s once stable.
4. **Issue the TLS certificate:**
   - Managed host: add the domain in their UI and they auto-issue via Let's Encrypt.
   - Self-hosted (nginx): `sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com` then `sudo certbot renew --dry-run` to confirm auto-renewal.
5. Verify `FRONTEND_URL` in your secret store exactly matches the canonical host (e.g. `https://housieghar.in`).

---

## 7. Set up GitHub Actions secrets for deploy hooks

In your GitHub repo → **Settings → Secrets and variables → Actions**, add:

| Secret name | Value |
|---|---|
| `RAILWAY_STAGING_DEPLOY_HOOK` | Deploy hook URL from Railway staging service |
| `RAILWAY_PRODUCTION_DEPLOY_HOOK` | Deploy hook URL from Railway production service |

Replace the `https://api.yourdomain.com/health` URL in `.github/workflows/ci.yml` with your actual backend domain.

---

## 8. Enable branch protection on `main`

In GitHub → **Settings → Branches → Add branch protection rule** for `main`:
- ✅ Require a pull request before merging
- ✅ Require status checks to pass (select the `Test · Lint · Build` job)
- ✅ Require branches to be up to date before merging
- ✅ Do not allow bypassing the above settings

---

## 9. Set up Sentry error tracking (~15 minutes)

1. Create a free account at [sentry.io](https://sentry.io).
2. Create two projects: one Node.js (backend), one Next.js (frontend).
3. Add the `SENTRY_DSN` for the backend to your host's secret store.
4. In the frontend, run:
   ```bash
   cd HG/frontend && npx @sentry/wizard@latest -i nextjs
   ```
   Accept all prompts. Set `SENTRY_DSN` in your Next.js environment variables.

---

## 10. Set up UptimeRobot (~5 minutes)

1. Create a free account at [uptimerobot.com](https://uptimerobot.com).
2. Add monitor 1: **HTTP(S)** `https://api.yourdomain.com/health`, 5-min interval.
3. Add monitor 2: **HTTP(S)** `https://yourdomain.com`, 5-min interval.
4. Configure alert contacts: email + SMS (both available on the free tier).

Do this before you invite a single user.

---

## 11. Force all seeded staff off their temporary passwords

The seed creates all staff with `temp_password_required = TRUE` and the password `ChangeMe123!` (public knowledge — it's in the repo). Before opening to users:

1. Log in as each staff account in the `/staff` UI.
2. Update the password to a strong unique value.
3. Repeat for every seeded account: `superadmin`, `cfo`, `operator`, `bookie1`, `bookie2`, `bookie3`.

Alternatively, delete and re-create them through the Admin UI with secure passwords.

---

## 12. Scan git history for committed secrets

```bash
brew install gitleaks
gitleaks detect --source . --verbose
```

If anything is found, **rotate the credential first** (it's compromised the instant it hit a remote), then scrub history:

```bash
pip install git-filter-repo
git filter-repo --path HG/.env --invert-paths
git push origin --force --all
```

---

## 13. Run npm audit before launch

```bash
cd HG/backend  && npm audit --audit-level=high
cd HG/frontend && npm audit --audit-level=high
```

Fix or document every `high`/`critical` finding before going live.

---

## 14. (Self-hosted only) Set up PM2 and log rotation

If hosting on a DigitalOcean Droplet:

```bash
npm install -g pm2

# First deploy
cd HG/backend && npm run build && npm run migrate
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup    # follow the printed command to auto-start on reboot

# Log rotation (prevents disk fill from chatty SSE/Socket logs)
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true

# Subsequent deploys (zero-downtime)
cd HG/backend && npm run build && npm run migrate
pm2 reload ecosystem.config.js --env production
```

---

## 15. (Self-hosted only) Configure nginx and firewall

Your `HG/nginx/nginx.conf` is structurally production-ready. After Certbot edits it:

1. Add the HTTP→HTTPS redirect and www→non-www redirect (see `launch.md` §9).
2. Verify the config and reload:
   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```
3. Lock down the firewall:
   ```bash
   sudo ufw allow 22    # SSH
   sudo ufw allow 80    # HTTP (for cert renewal + redirect)
   sudo ufw allow 443   # HTTPS
   sudo ufw enable
   ```

---

## 16. First smoke-test in production

After deploy, run the full booking flow manually:

1. Register a player at `/login`.
2. Browse games, select tickets, lock a booking.
3. Use dev-bypass if needed — confirm it is **blocked** in production (returns 404).
4. Have a bookie confirm via the staff dashboard.
5. Watch the live board via SSE draws.
6. Verify the winner overlay appears and the Hall of Fame updates.

If anything breaks, tail the structured logs (JSON in prod, pino-pretty in dev):

```bash
# Railway/Render: use their log viewer
# Self-hosted: pm2 logs housieghar-backend --lines 100
```
