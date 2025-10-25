/**
 * MongoDB Atlas Schema for Imaginary Crime Lab
 * 
 * Database: crimelab
 * Purpose: Real-time, ephemeral activity state and live signals
 * NOT a system of record - just the heartbeat
 * 
 * Change Streams enabled on collections to broadcast mutations
 * Workers and UI subscribe to these streams for instant updates
 */

// ============================================================================
// Collection: activities
// Purpose: High-churn event log of all user interactions
// Retention: 7 days (TTL index)
// ============================================================================

db.createCollection("activities");

// Document schema (enforced via application, not MongoDB)
const activitySchema = {
  type: String,           // e.g., 'cart_add', 'case_viewed', 'checkout_created', 'case_solved'
  timestamp: Date,        // When the activity occurred
  worker_id: String,      // UUID of the Worker instance that logged it
  
  // Flexible data payload
  data: {
    evidence_id: String,     // Optional: which evidence was interacted with
    case_id: Number,         // Optional: which case was involved
    case_ids: [Number],      // Optional: multiple cases (for checkouts)
    evidence_ids: [String],  // Optional: multiple evidence items
    order_id: String,        // Optional: Shopify order ID
    session_id: String,      // Optional: client session identifier
  },
  
  // Metadata
  user_agent: String,      // Optional: browser info
  ip_hash: String,         // Optional: hashed IP for basic deduplication
};

// Example documents
db.activities.insertMany([
  {
    type: 'case_viewed',
    timestamp: new ISODate(),
    worker_id: 'cf-worker-abc123',
    data: {
      case_id: 1,
      session_id: 'sess_xyz789'
    }
  },
  {
    type: 'cart_add',
    timestamp: new ISODate(),
    worker_id: 'cf-worker-abc123',
    data: {
      evidence_id: 'FINGERPRINT_CARD',
      session_id: 'sess_xyz789'
    }
  },
  {
    type: 'checkout_created',
    timestamp: new ISODate(),
    worker_id: 'cf-worker-def456',
    data: {
      case_ids: [1, 2],
      evidence_ids: ['FINGERPRINT_CARD', 'TEMPERATURE_LOG'],
      checkout_id: 'shop_checkout_abc'
    }
  },
  {
    type: 'case_solved',
    timestamp: new ISODate(),
    worker_id: 'cf-worker-ghi789',
    data: {
      case_ids: [1],
      order_id: '1234567890',
      solved_by_purchase: true
    }
  }
]);

// TTL Index: Auto-delete activities older than 7 days
db.activities.createIndex(
  { timestamp: 1 },
  { expireAfterSeconds: 604800 } // 7 days in seconds
);

// Query index: Recent activities by type
db.activities.createIndex({ type: 1, timestamp: -1 });

// ============================================================================
// Collection: connections
// Purpose: Track active WebSocket/SSE connections for live counter
// Retention: 1 minute (TTL index)
// ============================================================================

db.createCollection("connections");

const connectionSchema = {
  connection_id: String,   // UUID for this connection
  worker_id: String,       // Which Worker is handling it
  connected_at: Date,      // When connection was established
  last_seen: Date,         // Last heartbeat
  session_id: String,      // Client session identifier
};

db.connections.createIndex(
  { last_seen: 1 },
  { expireAfterSeconds: 60 } // Auto-remove stale connections after 1 minute
);

db.connections.createIndex({ session_id: 1 });

// ============================================================================
// Collection: evidence_engagement
// Purpose: Real-time heatmap of which evidence is being viewed/carted
// Retention: 1 hour rolling window
// ============================================================================

db.createCollection("evidence_engagement");

const engagementSchema = {
  evidence_id: String,     // Shopify product ID
  event_type: String,      // 'view' | 'cart_add' | 'cart_remove'
  timestamp: Date,
  session_id: String,
  metadata: {
    time_on_page: Number,  // Seconds spent viewing
    scroll_depth: Number,  // % of page scrolled
  }
};

db.evidence_engagement.createIndex(
  { timestamp: 1 },
  { expireAfterSeconds: 3600 } // 1 hour
);

db.evidence_engagement.createIndex({ evidence_id: 1, timestamp: -1 });

// Aggregation pipeline example: Evidence popularity in last hour
db.evidence_engagement.aggregate([
  {
    $match: {
      timestamp: { $gte: new Date(Date.now() - 3600000) },
      event_type: 'view'
    }
  },
  {
    $group: {
      _id: '$evidence_id',
      view_count: { $sum: 1 },
      unique_sessions: { $addToSet: '$session_id' }
    }
  },
  {
    $project: {
      evidence_id: '$_id',
      view_count: 1,
      unique_viewers: { $size: '$unique_sessions' },
      engagement_score: { $multiply: ['$view_count', 0.3] }
    }
  },
  {
    $sort: { engagement_score: -1 }
  }
]);

// ============================================================================
// Collection: case_progress
// Purpose: Live tracking of which evidence users have collected per case
// Retention: 24 hours
// ============================================================================

db.createCollection("case_progress");

const progressSchema = {
  session_id: String,      // Client session
  case_id: Number,         // Which case
  collected_evidence: [String],  // Evidence IDs in cart
  progress_percentage: Number,   // % complete
  last_updated: Date,
  is_solvable: Boolean,    // Has all required evidence?
};

db.case_progress.createIndex({ session_id: 1, case_id: 1 }, { unique: true });
db.case_progress.createIndex(
  { last_updated: 1 },
  { expireAfterSeconds: 86400 } // 24 hours
);

// Update or insert progress
db.case_progress.updateOne(
  { session_id: 'sess_xyz789', case_id: 1 },
  {
    $set: {
      collected_evidence: ['FINGERPRINT_CARD', 'GUEST_MANIFEST'],
      progress_percentage: 50,
      last_updated: new Date(),
      is_solvable: false
    }
  },
  { upsert: true }
);

// ============================================================================
// Change Streams Configuration
// ============================================================================

/**
 * Enable Change Streams on activities collection
 * Workers and frontend subscribe to this stream for live updates
 */

// In Node.js Worker code:
/*
const changeStream = db.collection('activities').watch([
  {
    $match: {
      'operationType': { $in: ['insert', 'update'] },
      'fullDocument.type': { $in: ['case_solved', 'checkout_created'] }
    }
  }
]);

changeStream.on('change', (change) => {
  // Broadcast to all SSE clients
  broadcastToClients({
    type: change.fullDocument.type,
    data: change.fullDocument.data,
    timestamp: change.fullDocument.timestamp
  });
});
*/

/**
 * Change Stream for real-time connection count
 */

// Watch connections collection for inserts/deletes
/*
const connectionStream = db.collection('connections').watch();

connectionStream.on('change', async (change) => {
  if (change.operationType === 'insert' || change.operationType === 'delete') {
    const activeCount = await db.collection('connections').countDocuments({
      last_seen: { $gte: new Date(Date.now() - 30000) }
    });
    
    broadcastToClients({
      type: 'connection_count',
      count: activeCount,
      timestamp: new Date()
    });
  }
});
*/

// ============================================================================
// Helper Functions for Workers
// ============================================================================

/**
 * Log an activity from Worker
 */
async function logActivity(db, type, data, workerId) {
  return await db.collection('activities').insertOne({
    type,
    timestamp: new Date(),
    worker_id: workerId,
    data
  });
}

/**
 * Register a new connection
 */
async function registerConnection(db, connectionId, workerId, sessionId) {
  return await db.collection('connections').insertOne({
    connection_id: connectionId,
    worker_id: workerId,
    connected_at: new Date(),
    last_seen: new Date(),
    session_id: sessionId
  });
}

/**
 * Heartbeat to keep connection alive
 */
async function heartbeatConnection(db, connectionId) {
  return await db.collection('connections').updateOne(
    { connection_id: connectionId },
    { $set: { last_seen: new Date() } }
  );
}

/**
 * Get active connection count
 */
async function getActiveConnectionCount(db) {
  return await db.collection('connections').countDocuments({
    last_seen: { $gte: new Date(Date.now() - 30000) } // Active in last 30s
  });
}

/**
 * Update case progress for a session
 */
async function updateCaseProgress(db, sessionId, caseId, evidenceIds, requiredCount) {
  const progressPct = (evidenceIds.length / requiredCount) * 100;
  const isSolvable = evidenceIds.length === requiredCount;
  
  return await db.collection('case_progress').updateOne(
    { session_id: sessionId, case_id: caseId },
    {
      $set: {
        collected_evidence: evidenceIds,
        progress_percentage: progressPct,
        last_updated: new Date(),
        is_solvable: isSolvable
      }
    },
    { upsert: true }
  );
}

/**
 * Get recent activities (for SSE streaming)
 */
async function getRecentActivities(db, limit = 50) {
  return await db.collection('activities')
    .find()
    .sort({ timestamp: -1 })
    .limit(limit)
    .toArray();
}

// ============================================================================
// MongoDB Atlas Settings
// ============================================================================

/*
Recommended Atlas Configuration:

1. Cluster Tier: M0 (Free) or M10 (Shared)
   - M0 is sufficient for hobby project
   - Upgrade to M10 if high concurrency needed

2. Region: Same as Cloudflare Worker (e.g., us-east-1)
   - Minimize latency between Worker and MongoDB

3. Network Access:
   - Allow access from 0.0.0.0/0 (Cloudflare Workers have dynamic IPs)
   - Or use MongoDB Data API with HTTP endpoint

4. Database User:
   - Username: crimelab-worker
   - Role: readWrite on crimelab database

5. Change Streams:
   - Enabled by default on M10+ clusters
   - M0 clusters do NOT support Change Streams
   - For M0, use polling instead of streaming

6. Backup:
   - Not needed for ephemeral data
   - Neon Postgres is the system of record
*/

// ============================================================================
// Data Flow Summary
// ============================================================================

/*
User Action Flow:

1. User views case
   → Worker writes to activities { type: 'case_viewed', case_id: 1 }
   → Change Stream fires
   → All connected SSE clients receive update
   → Analytics updates in real-time

2. User adds evidence to cart
   → Worker writes to activities { type: 'cart_add', evidence_id: 'X' }
   → Worker updates case_progress for session
   → UI shows progress bar update instantly

3. User completes checkout
   → Worker writes to activities { type: 'checkout_created' }
   → Shopify processes payment
   → Webhook hits Worker
   → Worker marks cases solved in Neon (durable)
   → Worker writes to activities { type: 'case_solved' }
   → Change Stream broadcasts to all clients
   → UI shows case solution reveal animation

MongoDB = ephemeral, real-time signals
Neon = durable, source of truth
Shopify = commerce authority
Worker = orchestration layer
*/
