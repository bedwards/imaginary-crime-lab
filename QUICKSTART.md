# Quick Start Guide - Imaginary Crime Lab

Get the full stack running locally in under 10 minutes.

## Prerequisites

- Docker Desktop (or Docker Engine + Docker Compose)
- Node.js 20+ (for frontend development)
- Git

## Step-by-Step Setup

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/imaginary-crime-lab.git
cd imaginary-crime-lab
```

### 2. Start Local Services

```bash
# Start Postgres, MongoDB, and Worker
docker-compose up -d

# Check all services are healthy
docker-compose ps
```

You should see:
- ✅ `crimelab-neon` (Postgres on port 5432)
- ✅ `crimelab-mongo` (MongoDB on port 27017)
- ✅ `crimelab-worker` (Worker on port 8787)
- ✅ `crimelab-pgadmin` (pgAdmin on port 5050)
- ✅ `crimelab-mongo-express` (Mongo UI on port 8081)

### 3. Verify Database Setup

```bash
# Check Postgres schema loaded correctly
docker exec -it crimelab-neon psql -U crimelab -d crimelab -c "\dt"

# You should see: cases, case_evidence, purchases, case_analytics

# Check MongoDB collections
docker exec -it crimelab-mongo mongosh -u crimelab -p local_dev_password --authenticationDatabase admin crimelab --eval "db.getCollectionNames()"

# You should see: activities, connections, evidence_engagement, case_progress
```

### 4. Install Frontend Dependencies

```bash
cd frontend
npm install
```

### 5. Configure Environment

```bash
# Copy template
cp ../.env.template .env

# Edit .env and set local values (most are already correct for Docker setup)
# You'll need to add Shopify tokens after Step 6
```

### 6. Create Shopify Products

**Skip this for now if just exploring** - the app will work without real Shopify data, it just won't have product images or functional checkout.

For full functionality:

1. Create a Shopify Partner account → https://partners.shopify.com
2. Create a development store
3. Create products matching evidence names from `neon-schema.sql`:
   - FINGERPRINT_CARD
   - GUEST_MANIFEST
   - SECURITY_LOG
   - FIBER_SAMPLE
   - TEMPERATURE_LOG
   - CHEMICAL_RESIDUE
   - ENCRYPTED_DIARY
   - AUTOPSY_REPORT
   - EXPERIMENT_LOG
   - (etc. - see SQL file for full list)
4. Note the product IDs (visible in Shopify Admin URLs)
5. Update `neon-schema.sql` with actual IDs
6. Recreate Postgres:
   ```bash
   docker-compose down
   docker-compose up -d --force-recreate crimelab-neon
   ```

### 7. Start Frontend Dev Server

```bash
# From frontend directory
npm run dev
```

Frontend opens at: http://localhost:5173

### 8. Test the Flow

1. **View Cases**: Navigate to Active Cases tab
2. **Check System Internals**: Click "System Internals" to see live metrics
3. **Simulate Activity**:
   ```bash
   # Add activity to MongoDB
   curl -X POST http://localhost:8787/activity \
     -H "Content-Type: application/json" \
     -d '{
       "type": "case_viewed",
       "data": {"case_id": 1},
       "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
     }'
   ```
4. **Watch Live Updates**: System Internals tab shows activity stream in real-time
5. **Simulate Case Solve**:
   ```bash
   curl -X POST http://localhost:8787/webhook/order \
     -H "Content-Type: application/json" \
     -d '{
       "id": "test-order-123",
       "note_attributes": [
         {"name": "case_ids", "value": "1"}
       ]
     }'
   ```
6. **Verify Case Solved**: Check Active Cases tab - case #1 should show as solved

## Exploring the System

### Database Inspection

**Postgres (Neon simulation):**
- pgAdmin: http://localhost:5050
- Login: admin@crimelab.local / admin
- Add server:
  - Name: Local Neon
  - Host: neon-local
  - Port: 5432
  - Database: crimelab
  - Username: crimelab
  - Password: local_dev_password

**MongoDB:**
- Mongo Express: http://localhost:8081
- Auto-logs you in
- Explore collections: activities, connections

### API Testing

Worker API: http://localhost:8787

```bash
# Get all cases
curl http://localhost:8787/cases | jq

# Get evidence (proxies to Shopify)
curl http://localhost:8787/evidence | jq

# Get metrics
curl http://localhost:8787/metrics | jq

# Stream live activity (Server-Sent Events)
curl -N http://localhost:8787/activity/stream
```

### Worker Logs

```bash
# Follow all logs
docker-compose logs -f worker-local

# Just Worker errors
docker-compose logs -f worker-local | grep ERROR
```

## Common Issues

### Port Conflicts

If ports are already in use:
```bash
# Check what's using port 5432 (Postgres)
lsof -i :5432

# Kill process or change port in docker-compose.yml
```

### Database Not Initializing

```bash
# Completely reset
docker-compose down -v  # -v removes volumes
docker-compose up -d

# Check initialization logs
docker-compose logs neon-local
docker-compose logs mongodb
```

### Worker Can't Connect to Databases

```bash
# Verify network
docker network inspect imaginary-crime-lab_crimelab-network

# All containers should be on same network
# Check Worker environment variables
docker exec crimelab-worker env | grep DATABASE
```

### Frontend Can't Reach API

Check `VITE_API_BASE` in frontend/.env:
- Should be `http://localhost:8787` for local dev
- Vite proxy config handles `/api` prefix

## Next Steps

- Read [Architecture Deep Dive](./ARCHITECTURE.md)
- Set up real Shopify integration
- Deploy to production (see [README.md](./README.md#deployment))
- Add custom cases and evidence
- Explore Worker caching strategies

## Development Workflow

```bash
# Make frontend changes
# - Edit files in frontend/src
# - Hot reload automatic

# Make Worker changes
vim worker.js
docker-compose restart worker-local

# Make schema changes
vim neon-schema.sql  # or mongodb-schema.js
docker-compose down
docker-compose up -d --force-recreate

# Run full reset (nuclear option)
docker-compose down -v
docker-compose up -d
```

## Stopping

```bash
# Stop all containers
docker-compose down

# Stop and remove data
docker-compose down -v
```

## Getting Help

- Check logs: `docker-compose logs -f`
- Inspect services: `docker-compose ps`
- Shell into container: `docker exec -it crimelab-worker sh`
- Read full docs: [README.md](./README.md)

---

**You're now running the full distributed architecture locally!**

React → Worker → Neon + MongoDB + Shopify, all orchestrated transparently.
