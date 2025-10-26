import { neon } from '@neondatabase/serverless';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...headers,
    },
  });
}

// MongoDB connection helper using native driver approach
async function connectMongoDB(env) {
  const { MongoClient } = await import('mongodb');
  if (!env.MONGODB_URI) {
    throw new Error('MONGODB_URI not configured');
  }
  const client = new MongoClient(env.MONGODB_URI);
  await client.connect();
  return client.db('crimelab');
}

// Query Neon Postgres
async function queryNeon(env, query, params = []) {
  if (!env.NEON_DATABASE_URL) {
    throw new Error('NEON_DATABASE_URL not configured');
  }

  const sql = neon(env.NEON_DATABASE_URL);

  if (params.length === 0) {
    const result = await sql(query);
    return result;
  }

  const result = await sql.query(query, params);
  return result.rows || result;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    try {
      // Routes
      if (url.pathname === '/cases') {
        return await handleGetCases(env);
      }

      if (url.pathname === '/evidence') {
        return await handleGetEvidence(env);
      }

      if (url.pathname === '/metrics') {
        return await handleGetMetrics(env);
      }

      if (url.pathname === '/activity') {
        if (request.method === 'POST') {
          return await handlePostActivity(request, env);
        }
        return jsonResponse({ error: 'Method not allowed' }, 405);
      }

      if (url.pathname === '/activity/stream') {
        return await handleActivityStream(env);
      }

      if (url.pathname === '/activity/analytics') {
        return await handleActivityAnalytics(env);
      }

      if (url.pathname === '/checkout') {
        if (request.method === 'POST') {
          return await handleCreateCheckout(request, env);
        }
        return jsonResponse({ error: 'Method not allowed' }, 405);
      }

      if (url.pathname === '/webhook/order') {
        if (request.method === 'POST') {
          return await handleOrderWebhook(request, env);
        }
        return jsonResponse({ error: 'Method not allowed' }, 405);
      }

      return jsonResponse({ error: 'Not found' }, 404);
    } catch (error) {
      console.error('Worker error:', error);
      return jsonResponse({
        error: error.message,
        stack: error.stack,
        type: error.constructor.name
      }, 500);
    }
  },
};

// Get cases from Neon Postgres
async function handleGetCases(env) {
  try {
    const cases = await queryNeon(env, `
      SELECT id, number, title, description, solution, solved_at, required_evidence
      FROM cases
      ORDER BY id
    `);

    return jsonResponse(cases);
  } catch (error) {
    console.error('Error fetching cases:', error);
    // Return mock data if DB not configured
    return jsonResponse([
      {
        id: 1,
        number: 'C-2024-001',
        title: 'The Missing Heirloom',
        description: 'A 19th century pocket watch vanished from the Blackwood Estate during a dinner party.',
        solution: 'The butler did it.',
        solved_at: null,
        required_evidence: ['FINGERPRINT_CARD', 'GUEST_MANIFEST', 'SECURITY_LOG', 'FIBER_SAMPLE']
      }
    ]);
  }
}

// Get evidence from Shopify
async function handleGetEvidence(env) {
  const cache = caches.default;
  const cacheKey = new Request(request.url);

  let cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) {
    const clonedResponse = cachedResponse.clone();
    const body = await clonedResponse.json();
    return jsonResponse(body, 200, { 'X-Cache': 'HIT' });
  }

  if (!env.SHOPIFY_STORE_DOMAIN || !env.SHOPIFY_ADMIN_TOKEN) {
    throw new Error('Shopify not configured: SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN required');
  }

  const response = await fetch(
    `https://${env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/products.json`,
    {
      headers: {
        'X-Shopify-Access-Token': env.SHOPIFY_ADMIN_TOKEN,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const evidence = data.products.map(product => ({
    id: product.handle,
    name: product.title,
    description: product.body_html?.replace(/<[^>]*>/g, '') || '',
    price: product.variants[0]?.price || '0.00',
    variant_id: `gid://shopify/ProductVariant/${product.variants[0]?.id}`,
  }));

  // Cache for 5 minutes
  const cacheResponse = new Response(JSON.stringify(evidence), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
    },
  });
  await cache.put(cacheKey, cacheResponse);

  return jsonResponse(evidence, 200, { 'X-Cache': 'MISS' });
}

// Get metrics
async function handleGetMetrics(env) {
  try {
    const [cases, solved, evidence] = await Promise.all([
      queryNeon(env, 'SELECT COUNT(*) as count FROM cases'),
      queryNeon(env, 'SELECT COUNT(*) as count FROM cases WHERE solved_at IS NOT NULL'),
      queryNeon(env, 'SELECT COUNT(DISTINCT evidence_id) as count FROM case_evidence'),
    ]);

    return jsonResponse({
      total_cases: parseInt(cases[0]?.count || 0),
      solved_cases: parseInt(solved[0]?.count || 0),
      evidence_count: parseInt(evidence[0]?.count || 0),
      worker_timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching metrics:', error);
    return jsonResponse({
      total_cases: 4,
      solved_cases: 0,
      evidence_count: 20,
      worker_timestamp: new Date().toISOString(),
      error: 'Database not configured'
    });
  }
}

// Post activity to MongoDB
async function handlePostActivity(request, env) {
  try {
    const activity = await request.json();
    
    const db = await connectMongoDB(env);
    
    await db.collection('activities').insertOne({
      ...activity,
      timestamp: new Date(),
      worker_id: env.CF_RAY || crypto.randomUUID().split('-')[0],
    });

    console.log('Activity logged:', activity.type);
    return jsonResponse({ success: true });
  } catch (error) {
    console.error('Error logging activity:', error);
    return jsonResponse({ 
      success: false, 
      error: error.message 
    }, 500);
  }
}

// Server-Sent Events for live activity (polling-based for M0 free tier)
async function handleActivityStream(env) {
  const encoder = new TextEncoder();
  let lastTimestamp = new Date(Date.now() - 10000); // Start 10s ago

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const db = await connectMongoDB(env);
        
        // Send initial connection message
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'connected',
          timestamp: new Date().toISOString()
        })}\n\n`));

        // Poll for new activities every 3 seconds
        const interval = setInterval(async () => {
          try {
            const activities = await db.collection('activities')
              .find({ timestamp: { $gt: lastTimestamp } })
              .sort({ timestamp: 1 })
              .limit(10)
              .toArray();

            if (activities.length > 0) {
              for (const activity of activities) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  type: activity.type,
                  data: activity.data,
                  timestamp: activity.timestamp.toISOString()
                })}\n\n`));
              }
              lastTimestamp = activities[activities.length - 1].timestamp;
            }

            // Also send connection count
            const activeCount = await db.collection('activities')
              .distinct('data.session_id', {
                timestamp: { $gte: new Date(Date.now() - 30000) }
              });

            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'connection_count',
              count: activeCount.length,
              timestamp: new Date().toISOString()
            })}\n\n`));

          } catch (error) {
            console.error('Stream poll error:', error);
          }
        }, 3000);

        // Cleanup after 5 minutes
        setTimeout(() => {
          clearInterval(interval);
          controller.close();
        }, 300000);

      } catch (error) {
        console.error('Stream initialization error:', error);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'error',
          error: error.message,
          timestamp: new Date().toISOString()
        })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      ...CORS_HEADERS,
    },
  });
}

// MongoDB Analytics using Aggregation Pipeline
async function handleActivityAnalytics(env) {
  try {
    const db = await connectMongoDB(env);
    const now = new Date();
    const oneHourAgo = new Date(now - 3600000);
    const oneDayAgo = new Date(now - 86400000);

    // Run multiple aggregations in parallel
    const [
      recentActivities,
      topCases,
      topEvidence,
      activityTimeline,
      activityTypes
    ] = await Promise.all([
      // Recent 20 activities
      db.collection('activities')
        .find()
        .sort({ timestamp: -1 })
        .limit(20)
        .toArray(),

      // Top 5 most viewed cases (last 24h)
      db.collection('activities').aggregate([
        {
          $match: {
            type: 'case_viewed',
            timestamp: { $gte: oneDayAgo }
          }
        },
        {
          $group: {
            _id: '$data.case_id',
            views: { $sum: 1 },
            last_viewed: { $max: '$timestamp' }
          }
        },
        { $sort: { views: -1 } },
        { $limit: 5 }
      ]).toArray(),

      // Top evidence items added to cart
      db.collection('activities').aggregate([
        {
          $match: {
            type: 'cart_add',
            timestamp: { $gte: oneDayAgo }
          }
        },
        {
          $group: {
            _id: '$data.evidence_id',
            adds: { $sum: 1 }
          }
        },
        { $sort: { adds: -1 } },
        { $limit: 10 }
      ]).toArray(),

      // Activity timeline (events per 10-minute bucket for last hour)
      db.collection('activities').aggregate([
        {
          $match: {
            timestamp: { $gte: oneHourAgo }
          }
        },
        {
          $group: {
            _id: {
              $dateTrunc: {
                date: '$timestamp',
                unit: 'minute',
                binSize: 10
              }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]).toArray(),

      // Activity type breakdown
      db.collection('activities').aggregate([
        {
          $match: {
            timestamp: { $gte: oneDayAgo }
          }
        },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ]).toArray()
    ]);

    return jsonResponse({
      recent_activities: recentActivities.map(a => ({
        type: a.type,
        data: a.data,
        timestamp: a.timestamp,
        worker_id: a.worker_id
      })),
      top_cases: topCases.map(c => ({
        case_id: c._id,
        views: c.views,
        last_viewed: c.last_viewed
      })),
      top_evidence: topEvidence.map(e => ({
        evidence_id: e._id,
        cart_adds: e.adds
      })),
      activity_timeline: activityTimeline.map(t => ({
        time: t._id,
        count: t.count
      })),
      activity_types: activityTypes.map(t => ({
        type: t._id,
        count: t.count
      })),
      generated_at: now.toISOString()
    });

  } catch (error) {
    console.error('Error fetching analytics:', error);
    return jsonResponse({
      error: error.message,
      recent_activities: [],
      top_cases: [],
      top_evidence: [],
      activity_timeline: [],
      activity_types: []
    }, 500);
  }
}

// Create Shopify checkout
async function handleCreateCheckout(request, env) {
  const { variant_ids, case_ids } = await request.json();

  if (!variant_ids || variant_ids.length === 0) {
    return jsonResponse({
      checkout_url: null,
      error: 'Cart is empty'
    });
  }

  if (!env.SHOPIFY_STORE_DOMAIN || !env.SHOPIFY_STOREFRONT_TOKEN) {
    throw new Error('Shopify not configured');
  }

  const lines = variant_ids.map(vid => ({
    merchandiseId: vid,
    quantity: 1,
  }));

  const mutation = `
    mutation cartCreate($input: CartInput!) {
      cartCreate(input: $input) {
        cart {
          id
          checkoutUrl
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const shopifyResponse = await fetch(
    `https://${env.SHOPIFY_STORE_DOMAIN}/api/2024-10/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': env.SHOPIFY_STOREFRONT_TOKEN,
      },
      body: JSON.stringify({
        query: mutation,
        variables: {
          input: {
            lines,
            attributes: [
              { key: 'case_ids', value: JSON.stringify(case_ids) }
            ]
          },
        },
      }),
    }
  );

  const checkoutData = await shopifyResponse.json();
  const cart = checkoutData.data?.cartCreate?.cart;
  const errors = checkoutData.data?.cartCreate?.userErrors;

  if (!cart || errors?.length > 0) {
    console.error('Cart creation failed:', JSON.stringify(errors || checkoutData, null, 2));
    return jsonResponse({
      checkout_url: null,
      error: errors?.[0]?.message || 'Failed to create checkout'
    });
  }

  // Log checkout creation to MongoDB
  try {
    const db = await connectMongoDB(env);
    await db.collection('activities').insertOne({
      type: 'checkout_created',
      timestamp: new Date(),
      worker_id: env.CF_RAY || 'unknown',
      data: {
        case_ids,
        evidence_count: variant_ids.length,
        checkout_id: cart.id
      }
    });
  } catch (error) {
    console.error('Failed to log checkout activity:', error);
  }

  return jsonResponse({
    checkout_url: cart.checkoutUrl,
    cart_id: cart.id
  });
}

// Handle Shopify order webhook
async function handleOrderWebhook(request, env) {
  try {
    const order = await request.json();
    
    // Extract case_ids from order attributes
    const caseIdsAttr = order.note_attributes?.find(attr => attr.name === 'case_ids');
    const caseIds = caseIdsAttr ? JSON.parse(caseIdsAttr.value) : [];

    if (caseIds.length === 0) {
      console.log('No case IDs in order');
      return jsonResponse({ success: true, message: 'No cases to solve' });
    }

    // Mark cases as solved in Neon
    await queryNeon(
      env,
      `UPDATE cases SET solved_at = NOW() WHERE id = ANY($1)`,
      [caseIds]
    );

    // Log to MongoDB
    const db = await connectMongoDB(env);
    await db.collection('activities').insertOne({
      type: 'case_solved',
      timestamp: new Date(),
      worker_id: env.CF_RAY || 'webhook',
      data: {
        case_ids: caseIds,
        order_id: order.id,
        total_price: order.total_price
      }
    });

    console.log(`Solved cases: ${caseIds.join(', ')}`);
    return jsonResponse({ success: true, solved_cases: caseIds });

  } catch (error) {
    console.error('Webhook error:', error);
    return jsonResponse({ 
      success: false, 
      error: error.message 
    }, 500);
  }
}
