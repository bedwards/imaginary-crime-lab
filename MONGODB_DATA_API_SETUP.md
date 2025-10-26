# MongoDB Data API Setup Guide

## The Problem

Cloudflare Workers can't use the MongoDB native driver - it causes "Too many subrequests" errors. We need to use MongoDB's **Data API** instead (HTTP-based).

## Setup MongoDB Data API

### 1. Enable Data API in MongoDB Atlas

1. Go to https://cloud.mongodb.com
2. Select your cluster
3. Click **"Data API"** in the left sidebar (under "Services")
4. Click **"Enable the Data API"**
5. Copy the **Data API URL** - looks like:
   ```
   https://data.mongodb-api.com/app/data-xxxxx/endpoint/data/v1
   ```

### 2. Create an API Key

1. Still in the Data API tab, click **"Create API Key"**
2. Name it: `crime-lab-worker`
3. Copy the API Key (you won't see it again!)
4. It looks like: `xxxxxxxxxxxxxxxxxxxxx`

### 3. Note Your Cluster Name

1. Go to your cluster overview
2. Note the cluster name (usually `Cluster0` for free tier)

## Deploy to Cloudflare Workers

### 1. Set Secrets

```bash
# MongoDB Data API URL
wrangler secret put MONGODB_DATA_API_URL --env production
# Paste: https://data.mongodb-api.com/app/data-xxxxx/endpoint/data/v1

# MongoDB API Key
wrangler secret put MONGODB_API_KEY --env production
# Paste: xxxxxxxxxxxxxxxxxxxxx

# MongoDB Cluster Name
wrangler secret put MONGODB_CLUSTER --env production
# Type: Cluster0 (or your cluster name)
```

### 2. Deploy Worker

```bash
# Copy fixed worker
cp worker-fixed.js worker.js

# Deploy
wrangler deploy --env production

# Watch logs
wrangler tail --env production
```

### 3. Test It

```bash
# Test activity logging
curl -X POST https://your-worker.workers.dev/activity \
  -H "Content-Type: application/json" \
  -d '{"type":"test","data":{"message":"hello"}}'

# Check MongoDB Atlas
# Go to: Cluster → Browse Collections → crimelab → activities
# Should see the test document

# Test analytics
curl https://your-worker.workers.dev/activity/analytics | jq

# Test SSE stream
curl -N https://your-worker.workers.dev/activity/stream
```

## Verify in MongoDB Atlas

1. Go to **Cluster → Browse Collections**
2. Database: `crimelab`
3. Collection: `activities`
4. You should see documents like:

```json
{
  "_id": {"$oid": "..."},
  "type": "test",
  "timestamp": {"$date": "2025-10-26T..."},
  "worker_id": "abc123",
  "data": {
    "message": "hello"
  }
}
```

## Create Indexes (Optional but Recommended)

In MongoDB Atlas → Cluster → Browse Collections → activities → Indexes:

```javascript
// Index for timestamp queries (with 7-day TTL)
{
  "timestamp": 1
}
// Options: { expireAfterSeconds: 604800 }

// Index for type + timestamp queries
{
  "type": 1,
  "timestamp": -1
}
```

## Local Development (Docker)

For local dev with Docker, MongoDB Data API isn't needed. The docker-compose setup uses direct MongoDB connection.

## Troubleshooting

### "MongoDB not configured" in logs

Missing one of these secrets:
- `MONGODB_DATA_API_URL`
- `MONGODB_API_KEY`

Check with:
```bash
wrangler secret list --env production
```

### Data API returns 401 Unauthorized

- API key is wrong or expired
- Recreate API key in Atlas Data API tab

### Data API returns 404 Not Found

- Check cluster name (should be `Cluster0` for free tier)
- Verify Data API is enabled in Atlas

### No data showing in analytics

1. Check worker logs: `wrangler tail --env production`
2. Verify activities are being written (test with curl)
3. Wait 5 seconds for frontend to refresh

## Cost

**MongoDB Data API is included free on M0 tier!**
- No extra charges
- Same 512MB limit
- No change streams, but we use polling instead

---

## Quick Reference

**Required Secrets:**
```bash
MONGODB_DATA_API_URL=https://data.mongodb-api.com/app/data-xxxxx/endpoint/data/v1
MONGODB_API_KEY=xxxxxxxxxxxxxxxxxxxxx
MONGODB_CLUSTER=Cluster0
```

**Test Commands:**
```bash
# Post activity
curl -X POST https://your-worker.workers.dev/activity \
  -d '{"type":"test","data":{}}' -H "Content-Type: application/json"

# Get analytics
curl https://your-worker.workers.dev/activity/analytics

# Stream events
curl -N https://your-worker.workers.dev/activity/stream
```

**MongoDB Atlas Paths:**
- Enable Data API: Cluster → Services → Data API → Enable
- Create API Key: Data API tab → Create API Key
- View Data: Cluster → Browse Collections → crimelab → activities
