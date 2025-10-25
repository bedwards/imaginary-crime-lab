# Imaginary Crime Lab - Project Manifest

**Portfolio artifact showcasing distributed architecture with zero black boxes.**

## 📁 Project Structure

```
imaginary-crime-lab/
├── frontend/
│   ├── src/
│   │   └── crime-lab-frontend.jsx      # React SPA (main app)
│   ├── package.json                     # Frontend dependencies
│   ├── vite.config.js                   # Vite build config
│   ├── tailwind.config.js               # Tailwind styling
│   └── index.html                       # Entry point
│
├── worker.js                            # Cloudflare Worker (API gateway)
├── wrangler.toml                        # Worker deployment config
│
├── neon-schema.sql                      # Postgres schema (cases, evidence)
├── mongodb-schema.js                    # MongoDB structure (live activity)
├── mongodb-init.js                      # MongoDB init script (Docker)
│
├── docker-compose.yml                   # Local dev environment
├── .env.template                        # Environment variables template
├── .gitignore                           # Git ignore rules
│
├── .github/
│   └── workflows/
│       └── deploy.yml                   # CI/CD pipeline
│
├── README.md                            # Main documentation
├── QUICKSTART.md                        # Quick setup guide
└── ARCHITECTURE.md                      # Deep dive diagrams

```

## 🗂️ Files by Purpose

### Core Application

| File | Purpose | Tech |
|------|---------|------|
| `crime-lab-frontend.jsx` | Main React UI with user/admin views | React 18 + Lucide icons |
| `worker.js` | API gateway, proxy, orchestration | Cloudflare Workers |

### Infrastructure

| File | Purpose | Tech |
|------|---------|------|
| `docker-compose.yml` | Local dev environment orchestration | Docker Compose |
| `neon-schema.sql` | Durable data structure | PostgreSQL 16 |
| `mongodb-schema.js` | Ephemeral activity structure | MongoDB 7.0 |
| `mongodb-init.js` | Auto-initialization for Docker | MongoDB Shell |

### Configuration

| File | Purpose | When Used |
|------|---------|-----------|
| `wrangler.toml` | Worker deployment settings | `wrangler deploy` |
| `vite.config.js` | Frontend build configuration | `npm run build` |
| `tailwind.config.js` | Styling system setup | Build time |
| `frontend-package.json` | Frontend dependencies | `npm install` |
| `.env.template` | Environment variables guide | Copy to `.env` |

### Documentation

| File | Audience | Content |
|------|----------|---------|
| `README.md` | Everyone | Philosophy, overview, deployment |
| `QUICKSTART.md` | Developers | Get running in 10 minutes |
| `ARCHITECTURE.md` | Technical deep dive | Data flows, diagrams, patterns |

### CI/CD

| File | Purpose | Trigger |
|------|---------|---------|
| `.github-workflows-deploy.yml` | Automated deployment | Push to `main` |
| `.gitignore` | Version control rules | Git operations |

## 🚀 Quick Reference

### Local Development Commands

```bash
# Start everything
docker-compose up -d

# View logs
docker-compose logs -f worker-local

# Reset database
docker-compose down -v && docker-compose up -d

# Frontend dev
cd frontend && npm install && npm run dev

# Test API
curl http://localhost:8787/cases | jq
```

### Deployment Commands

```bash
# Deploy Worker
wrangler deploy --env production

# Deploy Frontend
cd frontend
npm run build
npm run deploy

# Set Worker secrets
wrangler secret put NEON_DATABASE_URL
wrangler secret put MONGODB_URI
wrangler secret put SHOPIFY_STOREFRONT_TOKEN
wrangler secret put SHOPIFY_ADMIN_TOKEN
```

### Database Access

```bash
# Postgres (Neon local)
psql postgresql://crimelab:local_dev_password@localhost:5432/crimelab

# MongoDB (Atlas local)
mongosh mongodb://crimelab:local_dev_password@localhost:27017/crimelab

# pgAdmin
open http://localhost:5050

# Mongo Express
open http://localhost:8081
```

## 🎯 Key Design Principles

1. **Zero Black Boxes**: Every component's behavior is explicit and inspectable
2. **Separation of Concerns**: Commerce (Shopify), Structure (Neon), Signals (MongoDB)
3. **Edge-First**: Workers handle all orchestration at the edge
4. **Transparency as Feature**: System internals exposed in the UI
5. **Minimal Coupling**: Clean API boundaries between all systems

## 🔧 Technology Choices Rationale

| Component | Choice | Why |
|-----------|--------|-----|
| Frontend hosting | GitHub Pages | Free, versioned, transparent deployment |
| API layer | Cloudflare Workers | Edge computing, no cold starts, global |
| Durable storage | Neon Postgres | Serverless, relational, ACID guarantees |
| Live signals | MongoDB Atlas | Change Streams, TTL indexes, document model |
| Commerce | Shopify | Handles hard parts, JSON API only |

## 📊 Data Ownership Matrix

| Data Type | Owner | Why |
|-----------|-------|-----|
| Case definitions | Neon | Structured, relational, versioned |
| Evidence→Case map | Neon | Relational integrity (foreign keys) |
| Product catalog | Shopify | Commerce authority (prices, inventory) |
| Purchase records | Neon | Analytics, denormalized from Shopify |
| User activity | MongoDB | High-churn, ephemeral, real-time |
| Active connections | MongoDB | Transient state, auto-expires |
| Cart state | React (memory) | Session-only, no persistence needed |

## 🌊 Critical Data Flows

### 1. Page Load
```
User → GitHub Pages → React loads
     → fetch(/cases) → Worker → Neon → JSON
     → fetch(/evidence) → Worker → (cache) → Shopify → JSON
     → EventSource(/activity/stream) → Worker → MongoDB Change Stream
```

### 2. Add to Cart
```
User click → React state update (in-memory)
          → POST /activity → Worker → MongoDB insert
          → Change Stream fires → SSE → All clients
```

### 3. Purchase & Solve
```
User checkout → POST /checkout → Worker → Shopify GraphQL
             → Shopify payment flow
             → Webhook to Worker
             → UPDATE Neon (solved_at)
             → INSERT MongoDB (case_solved)
             → Change Stream → SSE → UI reveals solution
```

## 🎨 UI Views

| View | Shows | Data Source |
|------|-------|-------------|
| Active Cases | Unsolved cases with progress | Neon (cases) + React (cart state) |
| Evidence Store | Purchasable items | Shopify (via Worker cache) |
| System Internals | DB metrics, live activity, connections | Neon + MongoDB |
| Cart | Selected evidence, total price | React state (ephemeral) |

## 🔒 Security Posture

- ❌ **No authentication** (intentional - portfolio demo)
- ✅ **HTTPS everywhere** (GitHub Pages, Cloudflare, Shopify)
- ✅ **Secrets in Worker env vars** (not in code)
- ✅ **CORS configured** (allow all for demo)
- ⚠️ **In production**: Add Shopify customer accounts, API keys for admin views

## 📈 Scalability Profile

| Component | Free Tier | Bottleneck | Solution |
|-----------|-----------|------------|----------|
| GitHub Pages | 100 GB/month | Unlikely | Add Cloudflare CDN |
| Workers | 100k req/day | First bottleneck | Upgrade to $5/mo (10M) |
| Neon | 3 GB storage | Slow growth | Archive old data |
| MongoDB M0 | 512 MB | No Change Streams! | Upgrade to M10 ($9/mo) |

## 🧪 Testing Strategy

```bash
# Unit tests (to implement)
npm test

# Integration tests (to implement)
docker-compose up -d
npm run test:integration

# Manual smoke tests
curl http://localhost:8787/cases
curl http://localhost:8787/metrics
curl -N http://localhost:8787/activity/stream

# Webhook test
curl -X POST http://localhost:8787/webhook/order \
  -H "Content-Type: application/json" \
  -d '{"id": "test", "note_attributes": [{"name": "case_ids", "value": "1"}]}'
```

## 📦 Dependencies

### Frontend
- React 18.2
- Vite 5.0
- Tailwind CSS 3.3
- Lucide React (icons)

### Worker
- @neondatabase/serverless
- mongodb (Node driver)
- Shopify GraphQL (fetch-based)

### Development
- Docker & Docker Compose
- Node.js 20+
- Wrangler CLI

## 🎓 Learning Outcomes

This project demonstrates:

✅ **Distributed systems design** - coordinating multiple data stores  
✅ **Edge computing** - Workers as orchestration layer  
✅ **Real-time architecture** - Change Streams + SSE  
✅ **API design** - clean boundaries between services  
✅ **Infrastructure as code** - Docker Compose, Wrangler  
✅ **Transparent engineering** - making internals visible  

## 📚 Recommended Reading Order

1. `README.md` - Philosophy and overview
2. `QUICKSTART.md` - Get it running
3. `ARCHITECTURE.md` - Deep dive
4. Explore source files in this order:
   - `neon-schema.sql` (data structure)
   - `worker.js` (orchestration)
   - `crime-lab-frontend.jsx` (UI)
   - `mongodb-schema.js` (live signals)

## 🤝 Contributing

This is a portfolio piece, but PRs welcome for:
- Bug fixes
- Documentation improvements
- New case/evidence ideas
- Architecture optimizations

## 📄 License

MIT - Use this as a learning resource or fork for your own projects.

---

**Built with intention. No magic. Just clean distributed systems.**

