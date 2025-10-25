# Production Deployment Checklist

Complete guide for deploying Imaginary Crime Lab to production.

## Pre-Deployment Checklist

### ☐ GitHub Repository Setup

- [ ] Create repository: `imaginary-crime-lab`
- [ ] Push all code to `main` branch
- [ ] Enable GitHub Pages in Settings → Pages
- [ ] Set Pages source to "GitHub Actions" (not branch)
- [ ] Add repository description and topics

### ☐ Neon Postgres Setup

- [ ] Sign up at https://neon.tech
- [ ] Create new project: "Crime Lab Production"
- [ ] Create database: `crimelab`
- [ ] Copy connection string (format: `postgresql://user:pass@host/db`)
- [ ] Open SQL Editor in Neon Console
- [ ] Paste and execute entire `neon-schema.sql` file
- [ ] Verify tables created: `SELECT * FROM cases;`
- [ ] Note connection string for Worker secrets

**Connection string format:**
```
postgresql://[username]:[password]@[endpoint].neon.tech/crimelab?sslmode=require
```

### ☐ MongoDB Atlas Setup

- [ ] Sign up at https://cloud.mongodb.com
- [ ] Create organization (if new account)
- [ ] Create project: "Imaginary Crime Lab"
- [ ] Create cluster:
  - Name: `crimelab-prod`
  - Tier: M10 (required for Change Streams) - $9/month
  - Region: Same as Cloudflare Worker (e.g., us-east-1)
- [ ] Create database user:
  - Username: `crimelab-worker`
  - Password: Generate strong password
  - Role: `readWrite` on database `crimelab`
- [ ] Network Access:
  - Add IP: `0.0.0.0/0` (allow all - Cloudflare Workers have dynamic IPs)
  - Or: Add Cloudflare IP ranges (see Cloudflare docs)
- [ ] Get connection string:
  - Click "Connect" → "Connect your application"
  - Driver: Node.js
  - Copy connection string
- [ ] Replace `<password>` in connection string
- [ ] Replace `myFirstDatabase` with `crimelab`
- [ ] Add `?retryWrites=true&w=majority` to end of string
- [ ] Test connection (use MongoDB Compass)
- [ ] Note connection string for Worker secrets

**Connection string format:**
```
mongodb+srv://crimelab-worker:[password]@crimelab-prod.xxxxx.mongodb.net/crimelab?retryWrites=true&w=majority
```

### ☐ Shopify Setup

#### Create Shopify Partner Account

- [ ] Sign up at https://partners.shopify.com
- [ ] Create development store:
  - Store name: `crime-lab-dev.myshopify.com`
  - Purpose: Test & dev
  - Login to store

#### Create Custom App

- [ ] In Shopify Admin → Apps → "Develop apps"
- [ ] Click "Create an app"
- [ ] App name: "Crime Lab Integration"
- [ ] Configuration → Storefront API:
  - [ ] Enable: `unauthenticated_read_products`
  - [ ] Enable: `unauthenticated_read_product_listings`
  - [ ] Enable: `unauthenticated_write_checkouts`
  - [ ] Enable: `unauthenticated_read_checkouts`
- [ ] Configuration → Admin API:
  - [ ] Enable: `read_products`
  - [ ] Enable: `write_products`
  - [ ] Enable: `read_orders`
  - [ ] Enable: `write_orders`
- [ ] Install app
- [ ] API credentials → Copy tokens:
  - [ ] Storefront API access token (starts with `shpat_`)
  - [ ] Admin API access token (starts with `shpat_`)

#### Create Evidence Products

For each evidence item in `neon-schema.sql`:

- [ ] FINGERPRINT_CARD - Title: "Fingerprint Analysis Card", Price: $29
- [ ] GUEST_MANIFEST - Title: "Dinner Party Guest Manifest", Price: $15
- [ ] SECURITY_LOG - Title: "Estate Security Log", Price: $25
- [ ] FIBER_SAMPLE - Title: "Forensic Fiber Sample", Price: $35
- [ ] TEMPERATURE_LOG - Title: "Laboratory Temperature Log", Price: $20
- [ ] CHEMICAL_RESIDUE - Title: "Chemical Residue Analysis", Price: $40
- [ ] ENCRYPTED_DIARY - Title: "Encrypted Personal Diary", Price: $30
- [ ] AUTOPSY_REPORT - Title: "Official Autopsy Report", Price: $45
- [ ] EXPERIMENT_LOG - Title: "Final Experiment Log", Price: $25
- [ ] BLOOD_SPATTER - Title: "Blood Spatter Pattern Analysis", Price: $50
- [ ] CIPHER_KEY - Title: "Cryptographic Cipher Key", Price: $35
- [ ] HANDWRITING_SAMPLE - Title: "Handwriting Comparison Sample", Price: $30
- [ ] INK_ANALYSIS - Title: "Forensic Ink Analysis", Price: $40
- [ ] PURCHASE_RECORDS - Title: "Supplier Purchase Records", Price: $25
- [ ] DMV_PHOTOS - Title: "DMV Photo Database Access", Price: $20
- [ ] PAINT_COMPOSITION - Title: "Paint Composition Analysis", Price: $45
- [ ] UV_FLUORESCENCE - Title: "UV Fluorescence Report", Price: $40
- [ ] SHIPPING_MANIFEST - Title: "International Shipping Manifest", Price: $30
- [ ] AUTH_CERTIFICATES - Title: "Authentication Certificates", Price: $35
- [ ] SUPPLIER_LEDGER - Title: "Supplier Financial Ledger", Price: $25

**After creating all products:**

- [ ] Note each product's ID (visible in Admin URL)
- [ ] Update `neon-schema.sql` with actual product IDs
- [ ] Re-run schema SQL in Neon to update mappings

### ☐ Cloudflare Setup

- [ ] Sign up at https://cloudflare.com
- [ ] Note Account ID (Dashboard → Workers → Overview)
- [ ] Create API Token:
  - My Profile → API Tokens → Create Token
  - Use template: "Edit Cloudflare Workers"
  - Permissions: Account.Workers Scripts (Edit)
  - Copy token (starts with long string)
- [ ] Install Wrangler globally: `npm install -g wrangler`
- [ ] Login: `wrangler login`
- [ ] Verify: `wrangler whoami`

## Deployment Steps

### 1. Configure Wrangler

Edit `wrangler.toml`:

```toml
account_id = "your-account-id-here"  # From Cloudflare dashboard

[env.production]
vars = {
  SHOPIFY_STORE_DOMAIN = "crime-lab-dev.myshopify.com"
}
```

### 2. Set Worker Secrets

Never commit secrets to Git. Set them via CLI:

```bash
# Set Neon connection string
wrangler secret put NEON_DATABASE_URL --env production
# Paste: postgresql://user:pass@endpoint.neon.tech/crimelab?sslmode=require

# Set MongoDB connection string
wrangler secret put MONGODB_URI --env production
# Paste: mongodb+srv://user:pass@cluster.mongodb.net/crimelab?retryWrites=true&w=majority

# Set Shopify Storefront token
wrangler secret put SHOPIFY_STOREFRONT_TOKEN --env production
# Paste: shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Set Shopify Admin token
wrangler secret put SHOPIFY_ADMIN_TOKEN --env production
# Paste: shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 3. Deploy Worker

```bash
wrangler deploy --env production
```

**Expected output:**
```
 ⛅️ wrangler 3.x.x
-------------------
Uploaded crime-lab-api (x.xx sec)
Published crime-lab-api (x.xx sec)
  https://crime-lab-api.your-subdomain.workers.dev
```

Note the Worker URL - you'll need it for frontend config.

### 4. Test Worker Endpoints

```bash
# Get cases
curl https://crime-lab-api.your-subdomain.workers.dev/cases | jq

# Get evidence
curl https://crime-lab-api.your-subdomain.workers.dev/evidence | jq

# Get metrics
curl https://crime-lab-api.your-subdomain.workers.dev/metrics | jq
```

### 5. Configure Shopify Webhook

In Shopify Admin:
- [ ] Settings → Notifications → Webhooks
- [ ] Click "Create webhook"
- [ ] Event: `Order creation`
- [ ] Format: `JSON`
- [ ] URL: `https://crime-lab-api.your-subdomain.workers.dev/webhook/order`
- [ ] Webhook API version: Latest
- [ ] Save

Test webhook:
- [ ] Place a test order in your Shopify store
- [ ] Check Worker logs: `wrangler tail --env production`
- [ ] Verify case marked as solved in Neon

### 6. Build Frontend

```bash
cd frontend

# Install dependencies
npm install

# Create .env file
cp ../.env.template .env

# Edit .env
nano .env
# Set: VITE_API_BASE=https://crime-lab-api.your-subdomain.workers.dev

# Build for production
npm run build
```

### 7. Deploy Frontend to GitHub Pages

#### Option A: Manual Deploy

```bash
npm run deploy
# This runs: gh-pages -d dist
```

#### Option B: GitHub Actions (Automated)

- [ ] Add secrets to GitHub repo:
  - Settings → Secrets and variables → Actions
  - Add secret: `CLOUDFLARE_API_TOKEN`
  - Add secret: `CLOUDFLARE_ACCOUNT_ID`
  - Add secret: `NEON_DATABASE_URL`
  - Add secret: `MONGODB_URI`
  - Add secret: `SHOPIFY_STOREFRONT_TOKEN`
  - Add secret: `SHOPIFY_ADMIN_TOKEN`

- [ ] Copy `.github-workflows-deploy.yml` to `.github/workflows/deploy.yml`
- [ ] Edit workflow file:
  - Update `VITE_API_BASE` with your Worker URL
  - Update notification URLs
  - Remove `cname` if not using custom domain

- [ ] Commit and push:
  ```bash
  git add .github/workflows/deploy.yml
  git commit -m "Add CI/CD pipeline"
  git push origin main
  ```

- [ ] Monitor deployment: Actions tab in GitHub

### 8. Configure Custom Domain (Optional)

#### For GitHub Pages:

- [ ] Create CNAME record: `crime-lab.yourdomain.com` → `yourusername.github.io`
- [ ] GitHub Settings → Pages → Custom domain → Enter domain
- [ ] Wait for DNS check
- [ ] Enable "Enforce HTTPS"

#### For Cloudflare Worker:

- [ ] Cloudflare Dashboard → Workers → Routes
- [ ] Add route: `api.yourdomain.com/*` → `crime-lab-api`
- [ ] Update frontend `.env`: `VITE_API_BASE=https://api.yourdomain.com`
- [ ] Rebuild and redeploy frontend

## Post-Deployment Verification

### ☐ Smoke Tests

- [ ] Visit frontend URL
- [ ] Click "Active Cases" - cases load
- [ ] Click "Evidence Store" - products load from Shopify
- [ ] Click "System Internals" - metrics display
- [ ] Add evidence to cart
- [ ] Check Activity Feed - "cart_add" event appears
- [ ] Test checkout flow (use Shopify test card)
- [ ] Verify case marked as solved after purchase

### ☐ Monitoring Setup

- [ ] Cloudflare Dashboard → Workers → Your Worker → Metrics
  - Check request volume
  - Check error rate
  - Check CPU usage

- [ ] Neon Dashboard → Your Project → Monitoring
  - Check query performance
  - Check connection count

- [ ] MongoDB Atlas → Cluster → Metrics
  - Check operations/second
  - Check connections
  - Verify Change Streams active

### ☐ Performance Checks

- [ ] Run Lighthouse audit on frontend
  - Target: 90+ performance score
  - Target: 100 accessibility
  - Target: 100 best practices

- [ ] Check Worker response times
  - `/cases`: < 200ms
  - `/evidence`: < 500ms (first hit), < 100ms (cached)
  - `/metrics`: < 150ms

- [ ] Check edge cache hit rate
  - Target: > 80% for `/evidence`

## Production Maintenance

### Daily

- [ ] Check error rate in Cloudflare dashboard
- [ ] Monitor MongoDB connection count

### Weekly

- [ ] Review case solve rate
- [ ] Check database storage usage
- [ ] Review Shopify order volume

### Monthly

- [ ] Rotate API tokens (good practice)
- [ ] Archive old activities in MongoDB (if needed)
- [ ] Review costs across all services

## Rollback Plan

If deployment fails:

```bash
# Rollback Worker
wrangler rollback --env production

# Rollback Frontend (revert GitHub Pages)
cd frontend
git checkout <previous-commit-hash>
npm run build
npm run deploy
```

## Cost Monitoring

| Service | Free Tier | Expected Cost |
|---------|-----------|---------------|
| GitHub Pages | 100 GB/month | $0 |
| Cloudflare Workers | 100k req/day | $0-$5/month |
| Neon | 3 GB storage | $0 |
| MongoDB Atlas M10 | N/A | $9/month |
| Shopify Dev Store | Unlimited | $0 (dev only) |

**Total estimated cost: ~$9-14/month**

## Troubleshooting

### Worker 500 Errors

```bash
# Check Worker logs
wrangler tail --env production

# Common issues:
# - Incorrect database connection strings
# - Missing secrets
# - Shopify API rate limits
```

### Frontend Not Loading

- Check CORS headers in Worker
- Verify Worker URL in frontend `.env`
- Check browser console for errors
- Verify GitHub Pages is serving from `gh-pages` branch

### Cases Not Solving

- Verify Shopify webhook is hitting Worker
- Check `note_attributes` in webhook payload
- Verify case IDs match between Shopify and Neon
- Check Neon query logs

### MongoDB Connection Issues

- Verify IP whitelist (0.0.0.0/0)
- Check connection string format
- Ensure M10+ cluster (for Change Streams)
- Verify database name is `crimelab`

## Success Criteria

✅ Frontend loads at GitHub Pages URL  
✅ Cases display from Neon  
✅ Evidence loads from Shopify  
✅ System Internals shows live metrics  
✅ Activity feed updates in real-time  
✅ Test purchase solves case  
✅ Webhook hits Worker successfully  
✅ All logs show healthy status  
✅ No console errors in browser  

---

**Deployment complete! 🎉**

Your distributed architecture is now live and transparent.
