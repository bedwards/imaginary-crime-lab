// MongoDB initialization script for Imaginary Crime Lab
// Run automatically by Docker on first startup

// Switch to crimelab database
db = db.getSiblingDB('crimelab');

// Create collections with validation
db.createCollection('activities', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['type', 'timestamp', 'worker_id'],
      properties: {
        type: {
          bsonType: 'string',
          enum: ['case_viewed', 'cart_add', 'cart_remove', 'checkout_created', 'case_solved', 'connection_count']
        },
        timestamp: {
          bsonType: 'date'
        },
        worker_id: {
          bsonType: 'string'
        },
        data: {
          bsonType: 'object'
        }
      }
    }
  }
});

db.createCollection('connections', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['connection_id', 'worker_id', 'connected_at', 'last_seen'],
      properties: {
        connection_id: {
          bsonType: 'string'
        },
        worker_id: {
          bsonType: 'string'
        },
        connected_at: {
          bsonType: 'date'
        },
        last_seen: {
          bsonType: 'date'
        },
        session_id: {
          bsonType: 'string'
        }
      }
    }
  }
});

db.createCollection('evidence_engagement');
db.createCollection('case_progress');

// Create indexes
print('Creating indexes for activities...');
db.activities.createIndex(
  { timestamp: 1 },
  { expireAfterSeconds: 604800 }  // 7 days TTL
);
db.activities.createIndex({ type: 1, timestamp: -1 });

print('Creating indexes for connections...');
db.connections.createIndex(
  { last_seen: 1 },
  { expireAfterSeconds: 60 }  // 1 minute TTL
);
db.connections.createIndex({ session_id: 1 });

print('Creating indexes for evidence_engagement...');
db.evidence_engagement.createIndex(
  { timestamp: 1 },
  { expireAfterSeconds: 3600 }  // 1 hour TTL
);
db.evidence_engagement.createIndex({ evidence_id: 1, timestamp: -1 });

print('Creating indexes for case_progress...');
db.case_progress.createIndex(
  { session_id: 1, case_id: 1 },
  { unique: true }
);
db.case_progress.createIndex(
  { last_updated: 1 },
  { expireAfterSeconds: 86400 }  // 24 hours TTL
);

// Seed initial data for testing
print('Seeding test data...');
db.activities.insertMany([
  {
    type: 'case_viewed',
    timestamp: new Date(),
    worker_id: 'init-script',
    data: {
      case_id: 1,
      session_id: 'seed_session'
    }
  },
  {
    type: 'cart_add',
    timestamp: new Date(),
    worker_id: 'init-script',
    data: {
      evidence_id: 'FINGERPRINT_CARD',
      session_id: 'seed_session'
    }
  }
]);

db.connections.insertOne({
  connection_id: 'init-connection',
  worker_id: 'init-script',
  connected_at: new Date(),
  last_seen: new Date(),
  session_id: 'seed_session'
});

print('MongoDB initialization complete!');
print('Collections created:', db.getCollectionNames());
print('Activity count:', db.activities.countDocuments());
print('Connection count:', db.connections.countDocuments());
