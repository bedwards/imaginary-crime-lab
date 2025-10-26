# MongoDB Integration Deployment Guide

## What Changed

**Removed:**
- Change Streams (requires M10+ tier)
- Mock/fake data in SSE stream

**Added:**
- Real activity logging to MongoDB
- Aggregation pipeline analytics (top cases, evidence heatmap, activity breakdown)
- Polling-based SSE (works on free M0 tier)
- Rich analytics display in frontend

## Prerequisites

1. **MongoDB Atlas Account** (free M0 tier works)
   - Create cluster at https://cloud.mongodb.com
   - Get connection string: `mongodb+srv://username:password@cluster.mongodb.net`
   - Database name: `crimelab`
   - Collections auto-created: `activities`

2. **Wrangler Secret** (MongoDB connection string)
   ```bash
   wrangler secret put MONGODB_URI --env production
   # Paste: mongodb+srv://username:password@cluster.mongodb.net
   ```

## Deployment Steps

### 1. Install MongoDB Driver (if not already)
```bash
npm install mongodb
```

### 2. Test MongoDB Connection Locally
```bash
export MONGODB_URI="mongodb+srv://username:password@cluster.mongodb.net"
node test-mongodb.js
```

Expected output:
```
✅ Connected to MongoDB
✅ Inserted: [ObjectId]
✅ Total activities: 1
✅ Recent activities: 1
✅ Top activity types: test: 1
✅ Indexes: _id_, timestamp_1, type_1_timestamp_-1
✨ All tests passed!
```

### 3. Replace Worker Code
```bash
# Copy the new worker.js to your project root
cp /home/claude/worker.js ./worker.js
```

### 4. Deploy Worker
```bash
wrangler deploy --env production
```

### 5. Update Frontend
```bash
# Copy updated App.jsx
cp /home/claude/App.jsx ./frontend/src/App.jsx

# Build and deploy frontend
cd frontend
npm run build
npm run deploy
```

## Verify Deployment

### Check Worker Logs
```bash
wrangler tail --env production
```

### Test Endpoints
```bash
# Test activity logging
curl -X POST https://your-worker.workers.dev/activity \
  -H "Content-Type: application/json" \
  -d '{"type":"test","data":{"test":true}}'

# Check analytics
curl https://your-worker.workers.dev/activity/analytics | jq

# Test SSE stream
curl -N https://your-worker.workers.dev/activity/stream
```

### Check MongoDB Atlas UI
1. Go to https://cloud.mongodb.com
2. Navigate to your cluster → Browse Collections
3. Database: `crimelab` → Collection: `activities`
4. Should see documents appearing as users interact

## MongoDB Collections Structure

### activities
```javascript
{
  _id: ObjectId("..."),
  type: "case_viewed" | "cart_add" | "cart_remove" | "checkout_created" | "case_solved",
  timestamp: ISODate("2025-10-26T..."),
  worker_id: "abc123",
  data: {
    case_id: 1,
    session_id: "uuid-..."
  }
}
```

**Indexes:**
- `timestamp: 1` with TTL (7 days)
- `type: 1, timestamp: -1` for queries

## What You'll See

### Frontend - System Internals Tab

1. **Live Activity Stream** (polling every 3s)
   - Shows last 20 activities in real-time
   - Active session count

2. **Top Cases** (last 24h)
   - Most viewed cases using MongoDB aggregation
   - Shows view count and last viewed time

3. **Evidence Heatmap** (last 24h)
   - Most added-to-cart evidence
   - Visual bar chart

4. **Activity Type Breakdown** (last 24h)
   - Count of each activity type
   - Shows user engagement patterns

## Troubleshooting

### Error: "MONGODB_URI not configured"
```bash
wrangler secret put MONGODB_URI --env production
```

### Error: "MongoNetworkError"
- Check IP whitelist in MongoDB Atlas (use 0.0.0.0/0 for Workers)
- Verify connection string format

### No data showing in analytics
- Check worker logs: `wrangler tail --env production`
- Verify activities are being written: MongoDB Atlas → Browse Collections
- Wait 5 seconds for analytics refresh

### SSE stream not connecting
- Check browser console for errors
- Verify CORS headers in worker response
- Try: `curl -N https://your-worker.workers.dev/activity/stream`

## MongoDB Atlas Settings

**Network Access:**
- Add IP: `0.0.0.0/0` (allow all - Workers have dynamic IPs)

**Database User:**
- Username: `crimelab-worker` (or your choice)
- Role: `readWrite` on `crimelab` database

**Cluster Tier:**
- M0 (Free) - 512MB, no change streams
- Works perfectly with polling approach

## Performance Notes

- **SSE polls every 3 seconds** (not real-time, but close enough for free tier)
- **Analytics refresh every 5 seconds** on frontend
- **TTL indexes** auto-delete old documents (7 days retention)
- **Aggregation pipelines** are efficient even with free tier

## Cost

**Free Forever (M0 tier):**
- 512MB storage
- Shared CPU/RAM
- No change streams
- Perfect for hobby projects

**Upgrade to M10 ($9/mo) if:**
- Need real change streams for instant updates
- Want dedicated resources
- Storage > 512MB

---

That's it! MongoDB is now fully integrated with real activity logging and beautiful analytics displays.
