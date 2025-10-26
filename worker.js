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

// MongoDB Data API (HTTP-based, works in Workers)
async function mongoInsert(env, collection, document) {
  if (!env.MONGODB_DATA_API_URL || !env.MONGODB_API_KEY) {
    console.warn('MongoDB not configured - skipping insert');
    return { insertedId: 'mock' };
  }

  const response = await fetch(`${env.MONGODB_DATA_API_URL}/action/insertOne`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': env.MONGODB_API_KEY,
    },
    body: JSON.stringify({
      dataSource: env.MONGODB_CLUSTER || 'Cluster0',
      database: 'crimelab',
      collection,
      document,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`MongoDB insertOne failed: ${response.status} ${error}`);
  }

  return response.json();
}

async function mongoFind(env, collection, filter = {}, options = {}) {
  if (!env.MONGODB_DATA_API_URL || !env.MONGODB_API_KEY) {
    console.warn('MongoDB not configured - returning empty results');
    return { documents: [] };
  }

  const response = await fetch(`${env.MONGODB_DATA_API_URL}/action/find`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': env.MONGODB_API_KEY,
    },
    body: JSON.stringify({
      dataSource: env.MONGODB_CLUSTER || 'Cluster0',
      database: 'crimelab',
      collection,
      filter,
      ...options,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`MongoDB find failed: ${response.status} ${error}`);
  }

  return response.json();
}

async function mongoAggregate(env, collection, pipeline) {
  if (!env.MONGODB_DATA_API_URL || !env.MONGODB_API_KEY) {
    console.warn('MongoDB not configured - returning empty results');
    return { documents: [] };
  }

  const response = await fetch(`${env.MONGODB_DATA_API_URL}/action/aggregate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': env.MONGODB_API_KEY,
    },
    body: JSON.stringify({
      dataSource: env.MONGODB_CLUSTER || 'Cluster0',
      database: 'crimelab',
      collection,
      pipeline,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`MongoDB aggregate failed: ${response.status} ${error}`);
  }

  return response.json();
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
    
    await mongoInsert(env, 'activities', {
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
      // Send initial connection message
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        type: 'connected',
        timestamp: new Date().toISOString(),
        mongodb_configured: !!(env.MONGODB_DATA_API_URL && env.MONGODB_API_KEY)
      })}\n\n`));

      // If MongoDB not configured, send mock data and exit
      if (!env.MONGODB_DATA_API_URL || !env.MONGODB_API_KEY) {
        const mockInterval = setInterval(() => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'connection_count',
            count: Math.floor(Math.random() * 5) + 1,
            timestamp: new Date().toISOString(),
            mock: true
          })}\n\n`));
        }, 5000);

        setTimeout(() => {
          clearInterval(mockInterval);
          controller.close();
        }, 60000);
        return;
      }

      // Poll for new activities every 3 seconds
      const interval = setInterval(async () => {
        try {
          const result = await mongoFind(env, 'activities', 
            { timestamp: { $gt: { $date: lastTimestamp.toISOString() } } },
            { sort: { timestamp: 1 }, limit: 10 }
          );

          const activities = result.documents || [];

          if (activities.length > 0) {
            for (const activity of activities) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: activity.type,
                data: activity.data,
                timestamp: activity.timestamp
              })}\n\n`));
            }
            lastTimestamp = new Date(activities[activities.length - 1].timestamp);
          }

          // Also send active session count
          const sessionsResult = await mongoAggregate(env, 'activities', [
            {
              $match: {
                timestamp: { $gte: { $date: new Date(Date.now() - 30000).toISOString() } }
              }
            },
            {
              $group: {
                _id: '$data.session_id'
              }
            },
            {
              $count: 'total'
            }
          ]);

          const count = sessionsResult.documents?.[0]?.total || 0;

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'connection_count',
            count,
            timestamp: new Date().toISOString()
          })}\n\n`));

        } catch (error) {
          console.error('Stream poll error:', error);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
          })}\n\n`));
        }
      }, 3000);

      // Cleanup after 5 minutes
      setTimeout(() => {
        clearInterval(interval);
        controller.close();
      }, 300000);
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
    const now = new Date();
    const oneDayAgo = new Date(now - 86400000);

    // Run multiple aggregations in parallel
    const [
      recentResult,
      topCasesResult,
      topEvidenceResult,
      activityTypesResult
    ] = await Promise.all([
      // Recent 20 activities
      mongoFind(env, 'activities', {}, { sort: { timestamp: -1 }, limit: 20 }),

      // Top 5 most viewed cases (last 24h)
      mongoAggregate(env, 'activities', [
        {
          $match: {
            type: 'case_viewed',
            timestamp: { $gte: { $date: oneDayAgo.toISOString() } }
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
      ]),

      // Top evidence items added to cart
      mongoAggregate(env, 'activities', [
        {
          $match: {
            type: 'cart_add',
            timestamp: { $gte: { $date: oneDayAgo.toISOString() } }
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
      ]),

      // Activity type breakdown
      mongoAggregate(env, 'activities', [
        {
          $match: {
            timestamp: { $gte: { $date: oneDayAgo.toISOString() } }
          }
        },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ])
    ]);

    return jsonResponse({
      recent_activities: (recentResult.documents || []).map(a => ({
        type: a.type,
        data: a.data,
        timestamp: a.timestamp,
        worker_id: a.worker_id
      })),
      top_cases: (topCasesResult.documents || []).map(c => ({
        case_id: c._id,
        views: c.views,
        last_viewed: c.last_viewed
      })),
      top_evidence: (topEvidenceResult.documents || []).map(e => ({
        evidence_id: e._id,
        cart_adds: e.adds
      })),
      activity_types: (activityTypesResult.documents || []).map(t => ({
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
    await mongoInsert(env, 'activities', {
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
    await mongoInsert(env, 'activities', {
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
