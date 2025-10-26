# Imaginary Crime Lab - Production Operations Guide

**Cases solve themselves when you buy all the evidence.**

---

## What This Is

A distributed e-commerce experiment where purchasing evidence items automatically solves detective cases. Built as a portfolio artifact to demonstrate clean architecture across modern serverless platforms.

**The concept:** Four unsolved cases await investigation. Each requires 4-6 pieces of evidence. Buy all the evidence for a case, and it marks itself as solved through automated backend orchestration.

**The real product:** The architecture itself. This is a working demonstration of how to build transparent, distributed systems with minimal coupling and maximum visibility.

---

## The Philosophy

Most platforms hide their internals behind themes, plugins, and proprietary engines. This project inverts that. **The architecture is a user-facing feature.**

You can watch:
- SQL queries executing against Neon Postgres in real-time
- Workers proxying Shopify GraphQL requests with explicit caching
- MongoDB Change Streams broadcasting live activity via Server-Sent Events
- The exact moment a purchase triggers case resolution
- Edge cache hits/misses with TTL strategies exposed

**Zero black boxes.** Every component has a sharply defined role. Every integration point is explicit. No magic, just clean distributed systems made visible.

---

## Architecture Overview

### The Stack

```
┌─────────────────────────────────────────────────┐
│  React Frontend (GitHub Pages)                  │
│  Single-page UI, transparent static delivery    │
└─────────────────┬───────────────────────────────┘
                  │ HTTPS
                  ▼
┌─────────────────────────────────────────────────┐
│  Cloudflare Worker (Edge API Gateway)           │
│  Routes, proxies, caches, orchestrates          │
└──────┬────────────┬───────────────┬─────────────┘
       │            │               │
       ▼            ▼               ▼
┌──────────┐  ┌──────────┐  ┌─────────────┐
│  Neon    │  │ MongoDB  │  │  Shopify    │
│ Postgres │  │  Atlas   │  │ Storefront  │
│          │  │          │  │             │
│ Durable  │  │Ephemeral │  │  Commerce   │
│  Truth   │  │ Signals  │  │  Authority  │
└──────────┘  └──────────┘  └─────────────┘
```

### Component Roles

**GitHub Pages** - Serves the React frontend as versioned static files. No server-side rendering. No hidden runtime behavior. Pure Git-based deployment of HTML, CSS, and JavaScript.

**Cloudflare Workers** - The programmable edge. Every API request flows through Workers. They:
- Proxy Shopify GraphQL (Storefront + Admin) with proper signing
- Execute SQL queries against Neon via HTTP (`@neondatabase/serverless`)
- Stream live activity from MongoDB via Server-Sent Events
- Cache responses at the edge (5min TTL for products)
- Handle Shopify order webhooks to trigger case resolution

**Neon Postgres** - The durable system of record. Stores:
- `cases` table: 4 detective cases with solutions
- `case_evidence` table: Mapping of Shopify product IDs to cases
- `purchases` table: Denormalized order history from webhooks
- `case_analytics` table: Rollup metrics for monitoring

**MongoDB Atlas** - The ephemeral activity stream. Stores (with TTL):
- `activities`: User actions (view, cart add, checkout, solve) - 7 day retention
- `connections`: Active SSE connections - 1 minute retention
- Change Streams broadcast all inserts to connected clients in real-time

**Shopify** - The commerce authority. Only source of truth for:
- Products (20 evidence items, $5-15 each)
- Inventory, variants, pricing
- Cart creation and checkout flow
- Payment processing
- Order webhooks back to Worker

Used strictly as a JSON API - no Liquid templates, no Shopify storefront rendering.

### How It Works

**Browsing:**
1. User visits frontend (GitHub Pages)
2. React fetches cases from Worker (`GET /cases`)
3. Worker queries Neon: `SELECT * FROM cases WHERE solved_at IS NULL`
4. Worker fetches evidence from Worker (`GET /evidence`)
5. Worker checks edge cache, on miss queries Shopify Admin REST API
6. Products return cached for 5 minutes

**Purchasing:**
1. User adds evidence to cart (local state only)
2. User clicks "Purchase & Solve Cases"
3. React sends `POST /checkout { evidence_ids: [...], case_ids: [...] }`
4. Worker creates Shopify checkout with custom attributes
5. Browser redirects to Shopify checkout page
6. User completes payment

**Resolution:**
1. Shopify sends webhook `POST /webhook/order` to Worker
2. Worker extracts case_ids from order custom attributes
3. Worker executes: `UPDATE cases SET solved_at = NOW() WHERE id IN (...)`
4. Worker inserts into `purchases` table
5. Worker logs to MongoDB: `{ type: 'case_solved', case_id: X }`
6. MongoDB Change Stream fires
7. All connected clients receive SSE update instantly
8. Frontend updates solved cases in real-time

**Live Activity:**
Every user action (case view, cart add, checkout, solve) writes to MongoDB and broadcasts via Server-Sent Events to all connected clients. You watch the system work in real-time.

---

## Why This Matters

This project demonstrates:

**1. Separation of concerns at infrastructure level**  
Commerce (Shopify), structure (Neon), and ephemera (MongoDB) each live in purpose-built systems. No monolithic database trying to be everything.

**2. Minimal coupling, maximum transparency**  
Every component talks via explicit APIs. No hidden state. No framework magic. Request/response contracts are obvious and inspectable.

**3. Edge-first architecture**  
Workers handle all dynamic logic close to users. Databases are specialized, not monolithic. Frontend is pure static assets. Clean boundaries = clean scaling.

**4. Observability as a feature**  
Metrics aren't hidden in dashboards - they're exposed in the UI. Cache strategies aren't opaque - they're visible. This is architecture as pedagogy.

**5. Serverless done right**  
No containers to orchestrate. No connection pools to manage. No load balancers. Each component scales independently. The system is naturally resilient.

---

## Technical Stack Details

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Frontend** | React | 18.2.0 | UI components, state management |
| | Vite | 5.0.8 | Build tool, dev server, HMR |
| | Tailwind CSS | 3.3.6 | Styling system |
| | Lucide React | 0.294.0 | Icon library |
| **Deployment** | GitHub Pages | - | Static hosting from `gh-pages` branch |
| | GitHub Actions | - | CI/CD pipeline for auto-deployment |
| **API Gateway** | Cloudflare Workers | Runtime 2024-10-25 | Edge compute, request routing |
| | Wrangler | 3.x | CLI deployment tool |
| **Databases** | Neon Postgres | Serverless | Structured data (cases, evidence) |
| | @neondatabase/serverless | 1.x | HTTP-based SQL client for Workers |
| | MongoDB Atlas | M0/M10 | Activity streams, ephemeral state |
| **Commerce** | Shopify Storefront API | 2024-10 | Product queries (read-only) |
| | Shopify Admin API | 2024-10 | Product management, webhooks |

### Key Dependencies

**Worker (`worker.js`):**
- `@neondatabase/serverless` - SQL queries over HTTP (no connection pooling)
- Native `fetch()` - Shopify GraphQL requests
- No MongoDB driver - Uses native fetch to MongoDB Data API

**Frontend (`frontend/`):**
- Pure React 18 with hooks
- No state management library (local state + API calls)
- No routing library (single page, tab-based navigation)

### Development Tools

**Local Environment:**
- Docker Compose orchestrates 3 services:
  - `neon-local` - PostgreSQL 16 container
  - `mongodb` - MongoDB 7.0 container  
  - `worker-local` - Wrangler dev server
- `pgAdmin` on port 5050 for database inspection
- `mongo-express` on port 8081 for MongoDB GUI

**Scripts:**
- `shopify-setup.sh` - Bulk create products + webhook
- `create-products.js` - Uses Shopify Admin API
- `create-webhook.js` - Registers order webhook to Worker

---

## Stack:

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
**Stack:** Cloudflare Workers + Neon Postgres + MongoDB Atlas + Shopify + React

---

## By The Numbers

**Cases:** 4 (The Missing Heirloom, Locked Room Mystery, Cipher Killer, Forgery Ring)  
**Evidence Items:** 20 (4-6 per case, $5-15 each)  
**Tables:** 4 in Neon (cases, case_evidence, purchases, case_analytics)  
**Collections:** 3 in MongoDB (activities, connections, evidence_engagement)  
**Worker Endpoints:** 7 (cases, evidence, metrics, checkout, activity, stream, webhook)  
**API Calls Per Solve:** ~8 (Shopify checkout → webhook → Neon updates → MongoDB log → SSE broadcast)

**Free Tier Limits:**
- Cloudflare Workers: 100k requests/day
- Neon: 3GB storage, 20GB transfer/month
- MongoDB M0: 512MB (no Change Streams - upgrade to M10 for $9/mo)
- GitHub Pages: 100GB bandwidth/month

**First Bottleneck:** MongoDB M0 (no Change Streams for real-time SSE). Production requires M10+ tier.

---

## What You Won't Find Here

- **No authentication** - This is a public demo. Everyone shares the same global state.
- **No PII** - No user accounts, no personal data, no sensitive information.
- **No payment processing** - Shopify test mode only. Real cards won't be charged.
- **No theme lock-in** - React owns all rendering. Shopify is just an API.
- **No platform magic** - Everything explicit. No auto-scaling you don't understand.

---

## Learn More

- **Quick Start:** Clone → `docker-compose up` → Explore local dev environment
- **Deep Dive:** Read `ARCHITECTURE.md` for detailed flow diagrams
- **Source Code:** All components visible in repo root
- **Live Demo:** Deploy instructions above, runs on free tiers

Built with intention. No magic. Just clean distributed systems.
