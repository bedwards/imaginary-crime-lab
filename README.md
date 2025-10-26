# Imaginary Crime Lab - Production Operations Guide

**Stack:** React → GitHub Pages | Cloudflare Workers → Shopify + Neon Postgres + MongoDB Atlas

---

## Quick Deploy

### 1. Deploy Worker

```bash
# Login
wrangler login

# Deploy
wrangler deploy --env production

# Set secrets (one-time)
wrangler secret put NEON_DATABASE_URL --env production
wrangler secret put MONGODB_URI --env production
wrangler secret put SHOPIFY_STOREFRONT_TOKEN --env production
wrangler secret put SHOPIFY_ADMIN_TOKEN --env production
```

**Important:** Worker URL will be `https://crime-lab.YOUR-SUBDOMAIN.workers.dev` - copy from deploy output, don't guess.

### 2. Configure Shopify

Get tokens from Shopify Admin → Settings → Apps and sales channels → Develop apps:
- Create Custom App
- Enable Admin API scopes: `read_products`, `write_products`, `read_orders`, `write_orders`
- Enable Storefront API
- Copy both tokens

**Critical:** Use Admin REST API, not GraphQL Storefront (scope issues):
```javascript
// Worker uses this (works everywhere):
https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/products.json

// Not this (scope-dependent):
GraphQL Storefront API products query
```

### 3. Seed Shopify Products

```bash
export SHOPIFY_ADMIN_TOKEN=shpat_xxxxx
./shopify-setup.sh imaginary-crime-lab https://crime-lab.YOUR-SUBDOMAIN.workers.dev
```

This creates 20 evidence products and configures the webhook.

### 4. Update Neon Database

Run `shopify-setup.sh` output SQL in Neon SQL Editor to sync product IDs.

### 5. Deploy Frontend

GitHub Actions auto-deploys on push to main. Set these secrets in repo settings:
- `CLOUDFLARE_API_TOKEN` - for worker deployment
- `VITE_API_BASE` - your worker URL

**Critical:** Frontend needs worker URL at **build time**, not runtime.

---

## Troubleshooting Production

### Worker Not Responding

```bash
# Check deployment status
wrangler deployments list --env production

# Check secrets are set
wrangler secret list --env production

# Watch live logs
wrangler tail --env production
```

**Common issue:** Wrong worker URL. Copy from actual deploy output:
```bash
wrangler deploy --env production
# ✨ Published crime-lab (1.23s)
#    https://crime-lab.brian-mabry-edwards.workers.dev  <-- Use this exact URL
```

### Empty Data / Products Not Loading

```bash
# Test Worker directly
curl https://YOUR-WORKER.workers.dev/evidence
curl https://YOUR-WORKER.workers.dev/cases

# Test Shopify API directly
curl https://crime-lab.myshopify.com/admin/api/2024-10/products.json \
  -H "X-Shopify-Access-Token: $SHOPIFY_ADMIN_TOKEN"
```

**Root causes in order of frequency:**
1. Secrets not set (`wrangler secret list`)
2. Wrong worker URL in frontend
3. Products not published to "Online Store" channel in Shopify
4. Database connection string incorrect

### Checkout Redirects to `/undefined`

**Symptom:** Shopify checkout completes but redirects to broken URL.

**Root cause:** Frontend sending wrong data shape to worker.

**Worker expects:**
```javascript
POST /checkout
{ "evidence_ids": [123, 456], "case_ids": [1, 2] }
```

**Check frontend sends this, not:**
```javascript
{ "items": [{...full objects...}] }  // ❌ Wrong
```

### Database Queries Failing

```bash
# Test Neon connection
psql "$NEON_DATABASE_URL" -c "SELECT COUNT(*) FROM cases;"

# Test MongoDB connection
mongosh "$MONGODB_URI" --eval "db.runCommand({ping: 1})"

# Check Worker logs for query errors
wrangler tail --env production
```

**Common errors:**
- `Error 1042`: Worker timeout - missing env var or bad connection string
- `ECONNREFUSED`: Database cluster paused (MongoDB M0) or wrong connection string
- Empty results: Query syntax error, check Worker logs

### CORS Errors

**Symptom:** Browser console shows CORS error, but endpoint works in `curl`.

**Reality check:** CORS preflight (`OPTIONS`) success ≠ actual request success.

```bash
# Test both preflight and actual request
curl -X OPTIONS https://YOUR-WORKER.workers.dev/evidence -v
curl -X GET https://YOUR-WORKER.workers.dev/evidence -v
```

Worker already handles CORS correctly. If still failing, it's a backend error masked as CORS.

### Webhooks Not Firing

```bash
# Check webhook exists in Shopify
curl https://crime-lab.myshopify.com/admin/api/2024-10/webhooks.json \
  -H "X-Shopify-Access-Token: $SHOPIFY_ADMIN_TOKEN" | jq

# Test webhook endpoint manually
curl -X POST https://YOUR-WORKER.workers.dev/webhook/order \
  -H "Content-Type: application/json" \
  -d '{"id": "test", "note_attributes": [{"name": "case_ids", "value": "1,2"}]}'
```

**Webhook URL must exactly match worker URL.** Shopify won't follow redirects.

---

## Where Things Live

### Logs

| System | Command | What You'll See |
|--------|---------|----------------|
| **Worker** | `wrangler tail --env production` | Real-time errors, stack traces, GraphQL failures |
| **Worker (historical)** | Cloudflare Dashboard → Logs | Last 24h of errors with full context |
| **Frontend** | Browser DevTools → Console/Network | API call failures, CORS issues, env var problems |
| **Neon** | Neon Console → Logs | Slow queries, connection issues |
| **MongoDB** | Atlas Dashboard → Metrics | Connection count, query performance |
| **GitHub Actions** | `gh run list --workflow=deploy.yml` | Build/deploy failures |

### Data

| What | Where | How to Access |
|------|-------|---------------|
| **Cases (durable)** | Neon Postgres | Neon Console → SQL Editor |
| **Products** | Shopify | Admin → Products |
| **Activities (ephemeral)** | MongoDB Atlas | Atlas Console → Collections → `activities` |
| **Secrets** | Cloudflare Workers | `wrangler secret list --env production` |
| **Config** | wrangler.toml | This repo |

### Endpoints

Production worker exposes:
- `GET /cases` - List all cases
- `GET /evidence` - List Shopify products (cached 5min)
- `GET /metrics` - System stats
- `POST /checkout` - Create Shopify checkout
- `POST /activity` - Log user action
- `GET /activity/stream` - SSE stream of live updates
- `POST /webhook/order` - Shopify order webhook (internal)

---

## Emergency Runbook

### Site Completely Down

```bash
# 1. Check GitHub Pages
curl -I https://bedwards.github.io/imaginary-crime-lab

# 2. Check Worker
curl -I https://YOUR-WORKER.workers.dev/metrics

# 3. Check recent deployments
gh run list --workflow=deploy.yml --limit 5

# 4. Emergency redeploy
wrangler deploy --env production
cd frontend && npm run build && npm run deploy
```

### Database Connection Lost

```bash
# 1. Verify databases are up
psql "$NEON_DATABASE_URL" -c "SELECT 1;"
mongosh "$MONGODB_URI" --eval "db.runCommand({ping: 1})"

# 2. Verify Worker has secrets
wrangler secret list --env production

# 3. Check Worker logs for connection errors
wrangler tail --env production

# 4. Restore secrets if missing
wrangler secret put NEON_DATABASE_URL --env production
wrangler secret put MONGODB_URI --env production
```

### Shopify Integration Broken

```bash
# 1. Test Shopify API directly
curl https://crime-lab.myshopify.com/admin/api/2024-10/products.json \
  -H "X-Shopify-Access-Token: $SHOPIFY_ADMIN_TOKEN"

# 2. If token expired, regenerate in Shopify Admin
# Admin → Apps → Your custom app → API credentials

# 3. Update Worker secret
wrangler secret put SHOPIFY_ADMIN_TOKEN --env production
wrangler secret put SHOPIFY_STOREFRONT_TOKEN --env production

# 4. Verify Worker can connect
wrangler tail --env production &
curl https://YOUR-WORKER.workers.dev/evidence
```

### CI/CD Pipeline Broken

```bash
# 1. Check latest run
gh run view --log

# 2. Common fixes:
# - Missing secret: Settings → Secrets → Actions
# - Wrong Node version: Update .github/workflows/deploy.yml
# - Missing npm install: Add to workflow

# 3. Test build locally
cd frontend && npm install && npm run build

# 4. Manual deploy (bypass GitHub Actions)
wrangler deploy --env production
cd frontend && npm run deploy
```

---

## Key Learnings from Production Debugging

### 1. Follow the Data Flow

Surface errors often have upstream causes. If checkout redirects to `/undefined`, the bug was in the POST body shape, not the redirect logic.

### 2. Verify Deployment First

`error code: 1042` means Worker not deployed or crashed on startup. Always run `wrangler deployments list` before debugging API issues.

### 3. Copy URLs from Deploy Output

Don't assume worker subdomain format. `crime-lab.bedwards.workers.dev` might actually be `crime-lab.brian-mabry-edwards.workers.dev`.

### 4. Trust the Code, Not the Docs

Documentation drifts. If `ARCHITECTURE.md` says `evidence_ids` but `App.jsx` sends `items`, the code is the source of truth.

### 5. Test End-to-End Early

A single manual checkout test catches API contract mismatches before they reach production.

### 6. When One API Fails, Pivot

Storefront GraphQL blocked by missing scopes? Use Admin REST API instead. Don't fight the platform.

### 7. Stop Guessing, Start Proving

Use `curl` to test each assumption:
```bash
# Is Worker deployed?
wrangler deployments list

# Does Shopify API work?
curl https://STORE.myshopify.com/admin/api/2024-10/products.json -H "X-Shopify-Access-Token: $TOKEN"

# What's Worker returning?
wrangler tail --env production &
curl https://WORKER.workers.dev/evidence
```

---

## Architecture Cheat Sheet

```
Frontend (GitHub Pages)
  ├─ Build-time: Needs VITE_API_BASE
  └─ Runtime: Calls Worker API

Worker (Cloudflare)
  ├─ Runtime: Needs 4 secrets
  ├─ Shopify: Admin REST API (not GraphQL)
  ├─ Neon: SQL via @neondatabase/serverless
  ├─ MongoDB: Data API (not Node driver)
  └─ Caching: Edge cache, 5min TTL

Shopify
  ├─ Products: Created via Admin API
  ├─ Webhook: Points to Worker /webhook/order
  └─ Checkout: Custom attributes carry case_ids

Neon
  ├─ Schema: neon-schema.sql
  └─ Connection: HTTP-based serverless

MongoDB
  ├─ Collections: Auto-created by Worker
  ├─ Change Streams: Requires M10+ tier
  └─ Connection: Standard connection string
```

---

## Free Tier Limits

| Service | Limit | When to Upgrade |
|---------|-------|----------------|
| Cloudflare Workers | 100k req/day | When traffic > 70k/day |
| Neon Postgres | 3GB storage | When storage > 2GB |
| MongoDB M0 | 512MB, no Change Streams | Need real-time updates |
| GitHub Pages | 100GB/month | Very unlikely to hit |

**First bottleneck:** MongoDB M0 (no Change Streams). Upgrade to M10 ($9/mo) for production live updates.

---

## Quick Reference Commands

```bash
# Deploy everything
wrangler deploy --env production
cd frontend && npm run build && npm run deploy

# Watch logs
wrangler tail --env production

# Test endpoints
curl https://WORKER.workers.dev/metrics
curl https://WORKER.workers.dev/cases
curl https://WORKER.workers.dev/evidence

# Check secrets
wrangler secret list --env production

# View deployments
wrangler deployments list --env production

# Test database connections
psql "$NEON_DATABASE_URL" -c "SELECT COUNT(*) FROM cases;"
mongosh "$MONGODB_URI" --eval "db.stats()"

# Test Shopify API
curl https://STORE.myshopify.com/admin/api/2024-10/products.json \
  -H "X-Shopify-Access-Token: $TOKEN"

# Check GitHub Actions
gh run list --workflow=deploy.yml --limit 5
gh run view --log
```

---

## Files That Matter

| File | Purpose | When to Edit |
|------|---------|--------------|
| `worker.js` | All backend logic | API changes, new endpoints |
| `wrangler.toml` | Worker config | Environment names, account ID |
| `.github/workflows/deploy.yml` | CI/CD | Add secrets, change build steps |
| `frontend/src/App.jsx` | Frontend logic | API contract, UI changes |
| `neon-schema.sql` | Database schema | Adding tables, changing structure |
| `shopify-setup.sh` | Shopify automation | New products, webhook config |

**Don't edit:** `ARCHITECTURE.md`, `DEPLOYMENT_GUIDE.md` - may be outdated. Trust the code.

---

**Owner:** Brian Edwards (@bedwards)  
**Repo:** https://github.com/bedwards/imaginary-crime-lab  
**Stack:** Cloudflare Workers + Neon + MongoDB + Shopify + React
