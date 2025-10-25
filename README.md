# 🔬 Imaginary Crime Lab

**Cases solve themselves when you buy all the evidence.**

A distributed e-commerce experiment where the architecture *is* the product. No black boxes. No template lock-in. Every layer visible, inspectable, and under explicit design control.

---

## The Philosophy

This is a hobby project and portfolio artifact built on a simple principle: **minimize magic while maximizing transparency**. 

Most e-commerce platforms hide their internals behind themes, plugins, and proprietary rendering engines. This project inverts that. The architecture itself becomes a user-facing feature. You see:

- Real-time GraphQL queries hitting Neon Postgres
- Workers proxying and signing Shopify API calls  
- MongoDB Change Streams broadcasting live activity
- Edge caching decisions and TTL strategies
- The exact moment a purchase triggers case resolution

The experience is a guided tour through a clean, distributed system where every component has a sharply defined role.

---

## Architecture Overview

### The Stack

```
┌─────────────────────────────────────────────────────┐
│  React Frontend (GitHub Pages)                      │
│  - Single-page UI showing user + admin views        │
│  - Transparent static delivery from Git             │
└──────────────────┬──────────────────────────────────┘
                   │
                   │ HTTPS
                   ▼
┌─────────────────────────────────────────────────────┐
│  Cloudflare Worker (Edge)                           │
│  - API gateway and orchestration                    │
│  - Proxies Shopify Storefront/Admin GraphQL         │
│  - Signs requests, caches aggressively              │
│  - Streams Server-Sent Events for live activity     │
└─────┬─────────────┬───────────────┬─────────────────┘
      │             │               │
      │             │               │
      ▼             ▼               ▼
┌──────────┐  ┌────────────┐  ┌───────────────┐
│  Neon    │  │  MongoDB   │  │  Shopify      │
│  Postgres│  │  Atlas     │  │  Storefront   │
│          │  │            │  │               │
│ Durable  │  │ Ephemeral  │  │ Commerce      │
│ Truth    │  │ Signals    │  │ Authority     │
└──────────┘  └────────────┘  └───────────────┘
```

### Component Roles

**GitHub Pages**: Serves the React frontend as versioned static files. No server-side rendering. No hidden runtime behavior. Just HTML, CSS, and JavaScript delivered from a clean Git workflow.

**Cloudflare Workers**: The programmable boundary. Every API request flows through Workers. They:
- Proxy Shopify GraphQL endpoints (Storefront + Admin)
- Execute queries against Neon via HTTP
- Stream live activity from MongoDB via Server-Sent Events
- Cache responses at the edge with explicit TTL
- Handle Shopify webhooks for order completion

**Shopify (Liquid APIs)**: The sole authority for commerce. Products, variants, inventory, carts, checkout. Used strictly as a JSON API—no HTML rendering, no Liquid templates touching the frontend.

**Neon Postgres**: Structured, durable data store. Everything not related to direct commerce or real-time activity goes here:
- Case definitions and solutions
- Evidence-to-case mappings
- Purchase history (denormalized from Shopify webhooks)
- Analytics rollups

**MongoDB Atlas**: Real-time, ephemeral activity state. High-churn, transient data:
- Live user interactions (cart adds, case views)
- Active connection tracking
- Evidence engagement heatmaps
- Change Streams broadcast mutations to Workers/UI instantly

---

## The Core Mechanic

Cases are puzzles. Each case requires specific pieces of evidence to solve. Evidence is sold as Shopify products.

1. User views unsolved cases
2. User adds evidence to cart
3. Progress bars update in real-time (MongoDB)
4. When cart contains all required evidence for a case, purchase triggers case resolution
5. Shopify webhook hits Worker
6. Worker marks case solved in Neon (durable truth)
7. Worker broadcasts via MongoDB Change Stream
8. All connected clients see the case solution reveal instantly

The commerce layer (Shopify) directly affects the application state (Neon), mediated by Workers, with real-time feedback via MongoDB.

---

## Data Boundaries

### What Lives Where

| Data Type | Storage | Rationale |
|-----------|---------|-----------|
| Case definitions | Neon Postgres | Structured, versioned, durable |
| Evidence mappings | Neon Postgres | Relational truth (which evidence solves which case) |
| Product catalog | Shopify | Commerce authority (prices, variants, inventory) |
| Purchase records | Neon Postgres | Denormalized from webhooks for analytics |
| Live user activity | MongoDB Atlas | High-churn, ephemeral, real-time signals |
| Active connections | MongoDB Atlas | Transient state, auto-expires after 1 minute |
| Evidence engagement | MongoDB Atlas | Rolling window, TTL-indexed |

**No overlap.** Each system owns a distinct concern. No data migrates between them except through explicit Worker orchestration.

---

## Key Design Decisions

### 1. No User Authentication

Every visit is the same "global user." This removes authentication complexity and exposes features that typical apps would hide. The UI shows both user-facing (evidence store, cases) and admin-facing (database metrics, live activity) views side by side.

The architecture becomes demonstrable. You see how Workers cache, how Neon queries perform, how MongoDB Change Streams broadcast updates.

### 2. Shopify as JSON API Only

Shopify Liquid templates are powerful, but they couple presentation to platform. By treating Shopify strictly as an API (Storefront GraphQL + Admin GraphQL), the frontend remains fully under your control in React.

Workers proxy all Shopify calls, adding:
- Request signing (Storefront Access Token)
- Aggressive edge caching (5-minute TTL for products)
- Custom attributes for order metadata (case IDs)

Shopify handles checkout, but you own the storefront surface entirely.

### 3. Neon for Structured Truth

Postgres excels at structured, relational data with ACID guarantees. Neon's serverless model fits edge computing:
- No long-running connections
- HTTP-based queries via `@neondatabase/serverless`
- Crisp row-level writes from Workers
- Indexed reads for fast case/evidence lookups

Views and functions encapsulate business logic (e.g., `solve_case()`, `record_purchase()`). The schema is transparent and versionable.

### 4. MongoDB for Live Heartbeat

MongoDB Atlas handles what Postgres doesn't serve well: real-time, ephemeral, high-churn activity. Change Streams are the killer feature:

```javascript
const changeStream = db.collection('activities').watch();
changeStream.on('change', (change) => {
  broadcastToAllClients(change.fullDocument);
});
```

When a case is solved, Workers write to MongoDB, Change Streams fire, and all connected SSE clients get updates instantly. No polling. No WebSockets. Just native MongoDB replication streams.

TTL indexes auto-delete stale data (activities older than 7 days, connections older than 1 minute). MongoDB becomes the live heartbeat without drifting into system-of-record territory.

### 5. Workers as Orchestration Layer

Cloudflare Workers sit between everything. They:
- Expose a unified API surface (`/cases`, `/evidence`, `/checkout`)
- Translate between Shopify GraphQL, Neon SQL, and MongoDB queries
- Cache responses with `caches.default` (explicit edge caching)
- Stream Server-Sent Events from MongoDB Change Streams
- Handle Shopify order webhooks

No magic. Just explicit request routing with full visibility.

---

## Local Development

### Prerequisites

- Docker & Docker Compose
- Node.js 20+ (for frontend dev)
- Shopify Partner account (for API tokens)

### Setup

1. **Clone and start services**:
   ```bash
   docker-compose up -d
   ```

2. **Create Shopify products**:
   - Log into Shopify Admin
   - Create products for each evidence item (see `neon-schema.sql` for names)
   - Note the product IDs (visible in Shopify Admin URLs)

3. **Update evidence mappings**:
   - Edit `neon-schema.sql`
   - Replace placeholder evidence IDs with actual Shopify product IDs
   - Recreate database:
     ```bash
     docker-compose down
     docker-compose up -d --force-recreate neon-local
     ```

4. **Configure Worker environment**:
   - Copy `.env.example` to `.env`
   - Add Shopify API tokens and store domain
   - Restart Worker:
     ```bash
     docker-compose restart worker-local
     ```

5. **Access services**:
   - Frontend: http://localhost:5173
   - Worker API: http://localhost:8787
   - pgAdmin (Neon): http://localhost:5050
   - MongoDB Express: http://localhost:8081

### Development Workflow

- **Frontend changes**: Edit files in `./frontend`, hot reload applies automatically
- **Worker changes**: Edit `worker.js`, restart with `docker-compose restart worker-local`
- **Schema changes**: Edit SQL/JS files, recreate containers with `--force-recreate`

### Testing Webhooks Locally

```bash
curl -X POST http://localhost:8787/webhook/order \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test-order-123",
    "note_attributes": [
      {"name": "case_ids", "value": "1,2"}
    ]
  }'
```

---

## Deployment

### 1. GitHub Pages (Frontend)

```bash
cd frontend
npm run build
# Commit dist/ to gh-pages branch
git subtree push --prefix dist origin gh-pages
```

Configure custom domain in GitHub repo settings if desired.

### 2. Cloudflare Workers

```bash
cd worker
wrangler publish
```

Set environment variables in Cloudflare dashboard:
- `NEON_DATABASE_URL`
- `MONGODB_URI`
- `SHOPIFY_STOREFRONT_TOKEN`
- `SHOPIFY_ADMIN_TOKEN`
- `SHOPIFY_STORE_DOMAIN`

### 3. Neon Postgres

- Create project at https://neon.tech
- Run `neon-schema.sql` in Neon's SQL Editor
- Copy connection string to Worker env vars

### 4. MongoDB Atlas

- Create cluster at https://cloud.mongodb.com
- Import `mongodb-schema.js` structure (or let Worker create collections dynamically)
- Enable Change Streams (M10+ tier required)
- Whitelist Cloudflare IPs (or use 0.0.0.0/0 for simplicity)
- Copy connection string to Worker env vars

### 5. Shopify Webhooks

Configure in Shopify Admin → Settings → Notifications → Webhooks:
- Event: `Order creation`
- Format: `JSON`
- URL: `https://your-worker.workers.dev/webhook/order`

---

## Observability

### Built-In Monitoring

The UI exposes internal metrics as features:

**System Internals View**:
- Database metrics from Neon (total cases, solved cases, evidence count)
- Live activity stream from MongoDB (cart adds, checkouts, case solutions)
- Active connection count (real-time)
- Shopify sync status and cache strategy

**Live Activity Feed**:
All user interactions logged to MongoDB and streamed to all clients via SSE. You see:
- `case_viewed` events
- `cart_add` / `cart_remove` events  
- `checkout_created` events
- `case_solved` events

### Logs

- **Worker logs**: `wrangler tail` or Cloudflare dashboard
- **Neon logs**: Neon dashboard → Logs
- **MongoDB logs**: Atlas dashboard → Metrics

---

## Scaling Considerations

### Current Limits

- **GitHub Pages**: 100 GB bandwidth/month (more than sufficient for static React app)
- **Cloudflare Workers**: 100k requests/day on free tier (upgrade to $5/month for 10M requests)
- **Neon**: 3 GB storage / 20 GB transfer on free tier
- **MongoDB Atlas**: M0 free cluster (512 MB storage, no Change Streams—upgrade to M10 for $9/month)

### What Breaks First

1. **MongoDB M0**: No Change Streams. Polling required for live updates. Upgrade to M10 ($9/mo) for production.
2. **Worker requests**: Free tier (100k/day) exhausts quickly with live activity. Upgrade to paid.
3. **Neon storage**: 3 GB sufficient for thousands of cases. Growth is slow since only durable data lives here.

### Horizontal Scaling

- **Frontend**: Infinitely cacheable via CDN (GitHub Pages + Cloudflare)
- **Workers**: Automatically scale at the edge (no action needed)
- **Neon**: Serverless scaling built-in (no connection pooling issues)
- **MongoDB**: Vertical scaling via cluster tier upgrades

No load balancers. No orchestration. The architecture scales naturally.

---

## Why This Matters

This project demonstrates:

1. **Separation of concerns at infrastructure level**  
   Commerce, structure, and ephemera each live in purpose-built systems.

2. **Minimal coupling, maximum transparency**  
   Every component talks via explicit APIs. No hidden state.

3. **Edge-first architecture**  
   Workers handle all dynamic logic close to users. Databases are specialized, not monolithic.

4. **Real-time without WebSockets**  
   MongoDB Change Streams + Server-Sent Events = live updates with less complexity.

5. **Platform independence**  
   Shopify handles payments, but you own the entire storefront experience in React.

6. **Inspectable by design**  
   The UI exposes database queries, cache hits/misses, live activity streams. Transparency as a feature.

---

## License

MIT. This is a portfolio project. Fork it, break it, learn from it.

---

## Acknowledgments

- Inspired by the principle: **If you can't see how it works, you don't fully control it.**
- Built with: React, Cloudflare Workers, Neon Postgres, MongoDB Atlas, Shopify Storefront API
- Container orchestration: Docker Compose + `bedwards/pg-graph-doc`

---

**Questions? Issues? Improvements?**  
This is a learning artifact. Open an issue or PR. Let's make distributed systems more understandable together.
