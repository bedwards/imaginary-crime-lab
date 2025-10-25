# Cloudflare Worker Deployment Instructions

## Fix Applied

The deployment errors you encountered were due to missing Node.js dependencies. I've fixed this by:

1. **Created `package.json`** - Defines the Worker project and its dependencies
2. **Updated `worker.js`** - Modified to use fetch-based APIs instead of Node.js drivers (more compatible with Workers runtime)
3. **Updated `wrangler.toml`** - Added proper configuration for Node.js compatibility

## What Changed

The original `worker.js` tried to use:
- `@neondatabase/serverless` - Replaced with Neon's HTTP API
- `mongodb` driver - Replaced with MongoDB Data API

The new version uses only fetch() calls, which are fully compatible with Cloudflare Workers.

## Next Steps to Deploy

### 1. Set Your Cloudflare API Token

```bash
export CLOUDFLARE_API_TOKEN="your-api-token-here"
```

Get your API token from: https://dash.cloudflare.com/profile/api-tokens
- Click "Create Token"
- Use template: "Edit Cloudflare Workers"

### 2. Deploy the Worker

```bash
wrangler deploy --env production
```

### 3. Set Worker Secrets

After deployment, set your secrets:

```bash
# Shopify tokens (required for product/checkout features)
wrangler secret put SHOPIFY_STOREFRONT_TOKEN --env production
wrangler secret put SHOPIFY_ADMIN_TOKEN --env production

# Database credentials (optional - Worker will use mock data if not set)
wrangler secret put NEON_DATABASE_URL --env production
wrangler secret put NEON_API_KEY --env production
wrangler secret put MONGODB_URI --env production
wrangler secret put MONGODB_DATA_API --env production
wrangler secret put MONGODB_API_KEY --env production
```

### 4. Update Your Frontend

Update the frontend to point to your deployed Worker URL:

```bash
# In frontend/.env or frontend/src/App.jsx
VITE_API_BASE=https://crime-lab-api.your-subdomain.workers.dev
```

## Database Configuration Notes

### For Neon (PostgreSQL):
- The Worker now uses Neon's HTTP API instead of the serverless client
- Get your Neon API key from: https://console.neon.tech/app/settings/api-keys

### For MongoDB:
- The Worker now uses MongoDB Data API instead of the Node.js driver
- Enable Data API in MongoDB Atlas: https://www.mongodb.com/docs/atlas/api/data-api/
- Create an API key in Atlas

### For Shopify:
- Works the same as before - just needs the tokens from your Shopify Admin

## Testing Your Deployment

Once deployed, test the endpoints:

```bash
# Test cases endpoint (will use mock data if DB not configured)
curl https://your-worker.workers.dev/cases

# Test evidence endpoint (will use mock data if Shopify not configured)  
curl https://your-worker.workers.dev/evidence

# Test metrics
curl https://your-worker.workers.dev/metrics
```

## Gradual Setup

The Worker is designed to work with partial configuration:

1. **No configuration**: Uses mock data for everything
2. **Just Shopify**: Real products, mock cases/activities
3. **Shopify + Neon**: Real products and cases, mock activities
4. **Full setup**: All systems connected

This allows you to deploy immediately and add integrations gradually.

## Troubleshooting

### If deployment still fails:
- Make sure you have a Cloudflare account
- Verify your account ID in wrangler.toml matches your actual account
- Check that you're logged in: `wrangler whoami`

### If endpoints return errors:
- Check Worker logs: `wrangler tail --env production`
- Verify secrets are set: `wrangler secret list --env production`
- Test with mock data first before adding real database connections

## File Structure

```
.
├── worker.js         # Main Worker code (fetch-based, no Node dependencies)
├── wrangler.toml     # Cloudflare Worker configuration
├── package.json      # Project metadata
└── README.md         # This file
```

## Summary

Your Worker is now ready to deploy! It will work immediately with mock data, and you can gradually add real integrations by setting the appropriate secrets.
