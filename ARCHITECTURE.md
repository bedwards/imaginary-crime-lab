# Architecture Deep Dive - Imaginary Crime Lab

Visual diagrams and detailed data flow explanations.

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER BROWSER                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  React SPA (GitHub Pages)                                │   │
│  │  - Case browser                                          │   │
│  │  - Evidence catalog                                      │   │
│  │  - System internals viewer                              │   │
│  │  - Real-time activity feed                              │   │
│  └────────────────┬─────────────────────────────────────────┘   │
│                   │                                             │
│                   │ HTTPS                                       │
└───────────────────┼─────────────────────────────────────────────┘
                    │
                    │
        ┌───────────▼──────────────────────────────────┐
        │   Cloudflare Worker (Edge Computing)         │
        │                                              │
        │  ┌──────────────────────────────────────┐   │
        │  │  API Gateway & Orchestrator          │   │
        │  │  - Route /cases                      │   │
        │  │  - Route /evidence                   │   │
        │  │  - Route /checkout                   │   │
        │  │  - Route /webhook                    │   │
        │  │  - Route /activity/stream (SSE)      │   │
        │  └─────┬──────────┬──────────┬──────────┘   │
        │        │          │          │              │
        └────────┼──────────┼──────────┼──────────────┘
                 │          │          │
        ┌────────▼──┐  ┌────▼────┐  ┌─▼────────────┐
        │   Neon    │  │ MongoDB │  │   Shopify    │
        │  Postgres │  │  Atlas  │  │  Storefront  │
        │           │  │         │  │              │
        │ Durable   │  │ Live    │  │  Commerce    │
        │ State     │  │ Signals │  │  Authority   │
        └───────────┘  └─────────┘  └──────────────┘
```

## Component Responsibilities

### React Frontend (GitHub Pages)

**Storage**: None - stateless except for in-memory React state  
**Purpose**: Pure UI layer with zero business logic  
**Deployed**: As static files on GitHub Pages CDN

**What it does:**
- Fetches data from Worker API endpoints
- Subscribes to Server-Sent Events for live updates
- Renders user-facing (cases, evidence) and admin-facing (metrics, activity) views
- Manages cart state in memory (no persistence)
- Redirects to Shopify Checkout for payment

**What it doesn't do:**
- Direct database access
- Direct Shopify API calls
- Authentication/authorization
- Data persistence (except localStorage for cart - but cart is ephemeral)

### Cloudflare Worker (Edge)

**Storage**: Edge Cache (HTTP responses, 5-minute TTL)  
**Purpose**: Orchestration, proxying, caching, streaming  
**Deployed**: Globally at Cloudflare edge locations

**What it does:**
- **API Gateway**: Unified `/api/*` surface for frontend
- **Shopify Proxy**: Signs and proxies Storefront/Admin GraphQL
- **Query Executor**: Runs SQL against Neon via HTTP
- **Activity Logger**: Writes events to MongoDB
- **Cache Manager**: Aggressive edge caching with explicit TTL
- **SSE Broadcaster**: Streams MongoDB Change Stream events to clients
- **Webhook Handler**: Receives Shopify order completion webhooks

**Request Flow Examples:**

```
GET /cases
├─> Query Neon: SELECT * FROM cases
├─> Transform to JSON
└─> Return with CORS headers

GET /evidence
├─> Check edge cache (key: evidence)
├─> If miss:
│   ├─> GraphQL to Shopify Storefront API
│   ├─> Sign request with Storefront Access Token
│   ├─> Parse products → evidence schema
│   ├─> Cache response (TTL: 300s)
│   └─> Return with X-Cache: MISS
└─> If hit:
    └─> Return cached response with X-Cache: HIT

POST /checkout
├─> Receive: { evidence_ids, case_ids }
├─> Fetch evidence details from cache/Shopify
├─> GraphQL mutation: checkoutCreate
├─> Attach case_ids as custom attributes
├─> Log to MongoDB: { type: 'checkout_created' }
├─> Return: { checkout_url }
└─> Client redirects to Shopify

POST /webhook/order (from Shopify)
├─> Receive order payload
├─> Extract case_ids from note_attributes
├─> Transaction 1: UPDATE cases SET solved_at = NOW()
├─> Transaction 2: INSERT INTO purchases
├─> Log to MongoDB: { type: 'case_solved' }
├─> MongoDB Change Stream fires
├─> All SSE clients receive update
└─> Return 200 OK

GET /activity/stream
├─> Establish SSE connection
├─> Open MongoDB Change Stream
├─> Watch: db.collection('activities').watch()
├─> On change event:
│   ├─> Format as SSE message
│   └─> Write to response stream
└─> Heartbeat every 30s
```

### Neon Postgres

**Storage**: Durable, relational, ACID-compliant  
**Purpose**: System of record for structured data  
**Deployed**: Neon serverless cluster

**Schema:**

```sql
cases
├─ id (PK)
├─ case_number (unique)
├─ title
├─ description
├─ solution
├─ difficulty
├─ created_at
└─ solved_at

case_evidence (join table)
├─ id (PK)
├─ case_id (FK → cases.id)
├─ evidence_id (Shopify product ID)
└─ is_critical

purchases (denormalized from Shopify)
├─ id (PK)
├─ order_id (Shopify order ID)
├─ evidence_ids (array)
├─ case_ids (array)
├─ total_amount
└─ completed_at

case_analytics (rollup metrics)
├─ case_id (FK → cases.id)
├─ views
├─ cart_adds
├─ completions
└─ last_updated
```

**Query Patterns:**

```sql
-- Worker reads (fast, indexed)
SELECT * FROM cases WHERE solved_at IS NULL

-- Worker writes (crisp, row-level)
UPDATE cases SET solved_at = NOW() WHERE id = $1

-- No long transactions
-- No connection pooling issues (serverless HTTP)
```

### MongoDB Atlas

**Storage**: Ephemeral, document-based, TTL-indexed  
**Purpose**: Real-time activity tracking and live signals  
**Deployed**: MongoDB Atlas M0/M10 cluster

**Collections:**

```javascript
activities (TTL: 7 days)
{
  type: 'case_viewed' | 'cart_add' | 'checkout_created' | 'case_solved',
  timestamp: ISODate,
  worker_id: UUID,
  data: {
    case_id?: Number,
    evidence_id?: String,
    order_id?: String
  }
}

connections (TTL: 1 minute)
{
  connection_id: UUID,
  worker_id: UUID,
  connected_at: ISODate,
  last_seen: ISODate,
  session_id: String
}

evidence_engagement (TTL: 1 hour)
{
  evidence_id: String,
  event_type: 'view' | 'cart_add',
  timestamp: ISODate,
  session_id: String
}

case_progress (TTL: 24 hours)
{
  session_id: String,
  case_id: Number,
  collected_evidence: [String],
  progress_percentage: Number,
  is_solvable: Boolean
}
```

**Change Streams:**

```javascript
// Worker subscribes to activity changes
db.collection('activities').watch([
  { $match: { 'operationType': 'insert' } }
])

// On insert → broadcast to all SSE clients
changeStream.on('change', (change) => {
  broadcastToClients(change.fullDocument);
});
```

### Shopify Storefront

**Storage**: Products, variants, inventory, carts, orders  
**Purpose**: Commerce authority - the only source of truth for pricing  
**Accessed**: Via Storefront + Admin GraphQL APIs

**Used for:**
- Product catalog (evidence items)
- Variant management (if evidence has options)
- Inventory tracking
- Cart creation
- Checkout flow
- Payment processing
- Order fulfillment webhooks

**Not used for:**
- Storefront rendering (React owns this)
- Custom app logic (Workers own this)
- Analytics storage (Neon owns this)

**Integration Points:**

```graphql
# Storefront API (read products)
query {
  products(first: 50) {
    edges {
      node {
        id
        title
        description
        priceRange { minVariantPrice { amount } }
      }
    }
  }
}

# Storefront API (create checkout)
mutation checkoutCreate($input: CheckoutCreateInput!) {
  checkoutCreate(input: $input) {
    checkout {
      id
      webUrl
    }
  }
}

# Webhook (order created)
POST /webhook/order
{
  "id": "1234567890",
  "note_attributes": [
    { "name": "case_ids", "value": "1,2,3" }
  ]
}
```

## Data Flow Scenarios

### Scenario 1: User Views Active Cases

```
User (Browser)
  └─> GET /cases
        └─> Worker
              └─> Query Neon
                    SELECT cases, case_evidence
                    WHERE solved_at IS NULL
              └─> Return JSON
        └─> React renders cases with progress bars
```

**Data touched:**
- Neon: `cases` table (read)
- Neon: `case_evidence` table (read)

**No writes**, pure read path.

### Scenario 2: User Adds Evidence to Cart

```
User (Browser)
  └─> Click "Add to Cart"
        └─> POST /activity
              └─> Worker
                    └─> Insert into MongoDB
                          db.activities.insertOne({
                            type: 'cart_add',
                            data: { evidence_id: 'X' }
                          })
                    └─> Change Stream fires
                          └─> SSE broadcast
        └─> React updates cart state (in-memory)
        └─> All clients see live activity update
```

**Data touched:**
- MongoDB: `activities` collection (write)
- MongoDB Change Stream → Worker → All SSE clients

### Scenario 3: User Completes Checkout

```
User (Browser)
  └─> Click "Purchase & Solve Cases"
        └─> POST /checkout { evidence_ids, case_ids }
              └─> Worker
                    ├─> GET /evidence (cached from Shopify)
                    ├─> GraphQL mutation: checkoutCreate
                    │     └─> Shopify creates cart + checkout
                    ├─> Attach case_ids as custom attributes
                    ├─> Log to MongoDB: checkout_created
                    └─> Return { checkout_url }
              └─> Browser redirects to Shopify
                    └─> User completes payment
                          └─> Shopify sends webhook
```

**Data touched:**
- Shopify: Checkout created (write)
- MongoDB: `activities` (write)

### Scenario 4: Order Completed (Webhook)

```
Shopify
  └─> POST /webhook/order
        └─> Worker
              ├─> Parse order payload
              ├─> Extract case_ids from note_attributes
              ├─> FOR EACH case_id:
              │     └─> Neon transaction:
              │           UPDATE cases SET solved_at = NOW()
              ├─> Neon transaction:
              │     INSERT INTO purchases
              ├─> MongoDB write:
              │     db.activities.insertOne({ type: 'case_solved' })
              ├─> Change Stream fires
              │     └─> SSE broadcast to all clients
              └─> Return 200 OK
        └─> All connected users see case solution instantly
```

**Data touched:**
- Neon: `cases` table (write)
- Neon: `purchases` table (write)
- MongoDB: `activities` collection (write)
- MongoDB Change Stream → Worker → All SSE clients

### Scenario 5: User Views System Internals

```
User (Browser)
  └─> Click "System Internals"
        └─> Parallel requests:
              ├─> GET /metrics
              │     └─> Worker
              │           └─> Query Neon
              │                 SELECT COUNT(*) FROM cases
              │                 SELECT COUNT(*) FROM case_analytics
              │           └─> Return metrics JSON
              │
              ├─> GET /activity/stream (SSE)
              │     └─> Worker
              │           └─> Open MongoDB Change Stream
              │                 db.activities.watch()
              │           └─> Stream events as Server-Sent Events
              │
              └─> React renders live dashboard
                    └─> Updates in real-time as events arrive
```

**Data touched:**
- Neon: Aggregates for metrics (read)
- MongoDB: Change Stream (streaming read)

## Caching Strategy

### Edge Cache (Cloudflare Worker)

```javascript
// Evidence catalog from Shopify
Cache-Control: public, max-age=300  // 5 minutes
Key: 'evidence'

// Metrics from Neon (can stale briefly)
Cache-Control: public, max-age=60   // 1 minute
Key: 'metrics'

// Cases (invalidate on solve)
Cache-Control: public, max-age=120  // 2 minutes
Key: 'cases'
```

**Cache Invalidation:**
- On case solve (webhook), purge `cases` cache key
- On new product, purge `evidence` cache key
- Metrics can stale up to 1 minute (acceptable)

### Browser Cache

GitHub Pages serves React with:
```
Cache-Control: public, max-age=3600  // 1 hour for static assets
Cache-Control: no-cache              // index.html must revalidate
```

## Security Model

### Authentication: None

**Why?** This is a portfolio/demo project showcasing architecture transparency.

**Implications:**
- Everyone is the same "global user"
- All data is publicly readable
- No PII or sensitive data stored
- Admin features exposed to everyone

**In production version:**
- Add Shopify customer accounts
- Gate admin views with API keys
- Implement JWT tokens from Worker

### API Security

**Worker endpoints:**
- CORS: Allow all origins (`*`)
- Rate limiting: Cloudflare's built-in
- No authentication required

**Shopify:**
- Storefront API: Public read access (by design)
- Admin API: Token secured (Worker only)
- Webhooks: HMAC verification (to implement)

**Database access:**
- Neon: Connection string in Worker env (secret)
- MongoDB: Connection string in Worker env (secret)
- No direct client access to databases

## Observability

### Logs

**Worker logs:**
```bash
wrangler tail --env production
```

**Neon logs:**
- Dashboard → Logs tab
- Slow query alerts

**MongoDB logs:**
- Atlas Dashboard → Metrics
- Change Stream throughput

### Metrics

**Exposed in UI:**
- Total cases
- Solved cases
- Evidence count
- Active connections
- Live activity feed

**Cloudflare Analytics:**
- Request count
- Error rate
- P50/P95/P99 latency
- Cache hit rate

### Alerting

**To implement:**
- Webhook failures → PagerDuty
- High error rate → Email
- Low cache hit rate → Slack

## Scaling Limits

| Component | Free Tier Limit | Scaling Strategy |
|-----------|----------------|------------------|
| GitHub Pages | 100 GB/month | Add Cloudflare CDN in front |
| Cloudflare Workers | 100k requests/day | Upgrade to $5/month (10M requests) |
| Neon Postgres | 3 GB storage | Prune old purchases, upgrade tier |
| MongoDB Atlas M0 | 512 MB, no Change Streams | Upgrade to M10 ($9/month) |
| Shopify | Varies by plan | Standard ecommerce scaling |

**Bottleneck prediction:**
1. MongoDB M0 (no Change Streams) → Upgrade to M10
2. Worker free tier requests → Upgrade to paid
3. Neon storage (slow growth) → Archive after 1 year

## Deployment Architecture

```
GitHub
  ├─ main branch
  │    └─ Push triggers GitHub Actions
  │         ├─ Deploy Worker (Wrangler)
  │         └─ Build + Deploy Frontend (gh-pages)
  │
  └─ gh-pages branch
       └─ Static files served by GitHub Pages
            └─ Cached by Cloudflare CDN

Cloudflare
  └─ Worker deployed to global edge
       └─ Secrets set via Wrangler CLI

Neon
  └─ Database provisioned
       └─ Schema applied manually (one-time)

MongoDB Atlas
  └─ Cluster provisioned
       └─ Collections auto-created by Worker
```

---

This architecture achieves:
✅ **Zero black boxes** - every component visible  
✅ **Minimal coupling** - clean API boundaries  
✅ **Maximum transparency** - internals are features  
✅ **Real-time updates** - Change Streams + SSE  
✅ **Explicit control** - no platform magic  

