// test-mongodb.js - Quick MongoDB connection and operations test
// Run with: node test-mongodb.js
import dotenv from "dotenv";
import { MongoClient } from 'mongodb';

dotenv.config({ path: ".env", quiet: true });
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI environment variable not set');
  process.exit(1);
}

async function testMongoDB() {
  console.log('🔌 Connecting to MongoDB...');

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db('crimelab');

    // Test 1: Insert a test activity
    console.log('\n📝 Test 1: Inserting test activity...');
    const result = await db.collection('activities').insertOne({
      type: 'test',
      timestamp: new Date(),
      worker_id: 'test-script',
      data: { message: 'MongoDB is working!' }
    });
    console.log('✅ Inserted:', result.insertedId);

    // Test 2: Count documents
    console.log('\n📊 Test 2: Counting activities...');
    const count = await db.collection('activities').countDocuments();
    console.log(`✅ Total activities: ${count}`);

    // Test 3: Recent activities
    console.log('\n📋 Test 3: Fetching recent activities...');
    const recent = await db.collection('activities')
      .find()
      .sort({ timestamp: -1 })
      .limit(5)
      .toArray();
    console.log('✅ Recent activities:', recent.length);
    recent.forEach(a => {
      console.log(`   - ${a.type} at ${a.timestamp.toISOString()}`);
    });

    // Test 4: Aggregation pipeline (top activity types)
    console.log('\n📈 Test 4: Running aggregation pipeline...');
    const pipeline = [
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ];
    const topTypes = await db.collection('activities').aggregate(pipeline).toArray();
    console.log('✅ Top activity types:');
    topTypes.forEach(t => {
      console.log(`   - ${t._id}: ${t.count}`);
    });

    // Test 5: Check indexes
    console.log('\n🔍 Test 5: Checking indexes...');
    const indexes = await db.collection('activities').indexes();
    console.log('✅ Indexes:', indexes.map(i => i.name).join(', '));

    console.log('\n✨ All tests passed! MongoDB is ready.');

  } catch (error) {
    console.error('\n❌ MongoDB test failed:', error.message);
    console.error('\nStack:', error.stack);
    process.exit(1);
  } finally {
    await client.close();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

testMongoDB();
