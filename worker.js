// Cloudflare Worker - API Gateway for Imaginary Crime Lab
// Routes: React frontend → Worker → Neon/MongoDB/Shopify

import { createClient } from '@neondatabase/serverless';
import { MongoClient } from 'mongodb';

// Environment variables set in Worker settings
// NEON_DATABASE_URL, MONGODB_URI, SHOPIFY_STOREFRONT_TOKEN, SHOPIFY_ADMIN_TOKEN, SHOPIFY_STORE_DOMAIN

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Route to handlers
      if (path === '/cases') {
        return await handleGetCases(env);
      }
      
      if (path === '/evidence') {
        return await handleGetEvidence(env);
      }
      
      if (path === '/metrics') {
        return await handleGetMetrics(env);
      }
      
      if (path === '/activity' && request.method === 'POST') {
        return await handlePostActivity(request, env);
      }
      
      if (path === '/activity/stream') {
        return await handleActivityStream(env);
      }
      
      if (path === '/checkout' && request.method === 'POST') {
        return await handleCreateCheckout(request, env);
      }
      
      if (path === '/webhook/order') {
        return await handleOrderWebhook(request, env);
      }
      
      return jsonResponse({ error: 'Not found' }, 404);
      
    } catch (error) {
      console.error('Worker error:', error);
      return jsonResponse({ error: error.message, stack: error.stack }, 500);
    }
  },
};

// Get cases from Neon Postgres
async function handleGetCases(env) {
  const neon = createClient({ connectionString: env.NEON_DATABASE_URL });
  
  const result = await neon`
    SELECT 
      c.id,
      c.case_number as number,
      c.title,
      c.description,
      c.solution,
      c.solved_at,
      array_agg(ce.evidence_id) as required_evidence
    FROM cases c
    LEFT JOIN case_evidence ce ON c.id = ce.case_id
    GROUP BY c.id
    ORDER BY c.case_number
  `;
  
  return jsonResponse(result);
}

// Get evidence from Shopify Storefront API
async function handleGetEvidence(env) {
  // Check Worker cache first
  const cache = caches.default;
  const cacheKey = new Request('https://cache/evidence', { method: 'GET' });
  let response = await cache.match(cacheKey);
  
  if (response) {
    const data = await response.json();
    return jsonResponse(data, 200, { 'X-Cache': 'HIT' });
  }
  
  // Fetch from Shopify
  const query = `
    query {
      products(first: 50) {
        edges {
          node {
            id
            title
            description
            priceRange {
              minVariantPrice {
                amount
              }
            }
            variants(first: 1) {
              edges {
                node {
                  id
                }
              }
            }
          }
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
      body: JSON.stringify({ query }),
    }
  );
  
  const shopifyData = await shopifyResponse.json();
  
  // Transform to our format
  const evidence = shopifyData.data.products.edges.map(({ node }) => ({
    id: node.id.split('/').pop(),
    name: node.title,
    description: node.description,
    price: node.priceRange.minVariantPrice.amount,
    variant_id: node.variants.edges[0].node.id,
  }));
  
  // Cache for 5 minutes
  const cacheResponse = new Response(JSON.stringify(evidence), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
    },
  });
  await cache.put(cacheKey, cacheResponse.clone());
  
  return jsonResponse(evidence, 200, { 'X-Cache': 'MISS' });
}

// Get metrics from Neon
async function handleGetMetrics(env) {
  const neon = createClient({ connectionString: env.NEON_DATABASE_URL });
  
  const [cases, solved, evidence] = await Promise.all([
    neon`SELECT COUNT(*) as count FROM cases`,
    neon`SELECT COUNT(*) as count FROM cases WHERE solved_at IS NOT NULL`,
    neon`SELECT COUNT(DISTINCT evidence_id) as count FROM case_evidence`,
  ]);
  
  return jsonResponse({
    total_cases: parseInt(cases[0].count),
    solved_cases: parseInt(solved[0].count),
    evidence_count: parseInt(evidence[0].count),
    worker_timestamp: new Date().toISOString(),
  });
}

// Post activity to MongoDB
async function handlePostActivity(request, env) {
  const activity = await request.json();
  
  const mongo = new MongoClient(env.MONGODB_URI);
  await mongo.connect();
  
  const db = mongo.db('crimelab');
  const collection = db.collection('activities');
  
  await collection.insertOne({
    ...activity,
    timestamp: new Date(),
    worker_id: crypto.randomUUID(),
  });
  
  await mongo.close();
  
  return jsonResponse({ success: true });
}

// Server-Sent Events for live activity
async function handleActivityStream(env) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  
  // Keep connection alive and send updates
  const interval = setInterval(async () => {
    try {
      const mongo = new MongoClient(env.MONGODB_URI);
      await mongo.connect();
      
      const db = mongo.db('crimelab');
      const activities = await db
        .collection('activities')
        .find({})
        .sort({ timestamp: -1 })
        .limit(10)
        .toArray();
      
      // Get connection count
      const connectionCount = await db.collection('connections').countDocuments({
        last_seen: { $gte: new Date(Date.now() - 30000) }
      });
      
      await mongo.close();
      
      // Send each activity
      for (const activity of activities) {
        await writer.write(
          encoder.encode(`data: ${JSON.stringify(activity)}\n\n`)
        );
      }
      
      // Send connection count
      await writer.write(
        encoder.encode(`data: ${JSON.stringify({ type: 'connection_count', count: connectionCount })}\n\n`)
      );
      
    } catch (error) {
      console.error('Stream error:', error);
    }
  }, 2000);
  
  // Cleanup on disconnect
  setTimeout(() => {
    clearInterval(interval);
    writer.close();
  }, 300000); // 5 minutes
  
  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      ...CORS_HEADERS,
    },
  });
}

// Create Shopify checkout
async function handleCreateCheckout(request, env) {
  const { evidence_ids, case_ids } = await request.json();
  
  // Get evidence details from cache/Shopify
  const evidenceResponse = await handleGetEvidence(env);
  const allEvidence = await evidenceResponse.json();
  const selectedEvidence = allEvidence.filter(e => evidence_ids.includes(e.id));
  
  // Create checkout via Shopify Storefront API
  const mutation = `
    mutation checkoutCreate($input: CheckoutCreateInput!) {
      checkoutCreate(input: $input) {
        checkout {
          id
          webUrl
        }
        checkoutUserErrors {
          field
          message
        }
      }
    }
  `;
  
  const lineItems = selectedEvidence.map(e => ({
    variantId: e.variant_id,
    quantity: 1,
  }));
  
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
            lineItems,
            customAttributes: [
              { key: 'case_ids', value: case_ids.join(',') }
            ],
          },
        },
      }),
    }
  );
  
  const checkoutData = await shopifyResponse.json();
  
  // Log checkout created to MongoDB
  const mongo = new MongoClient(env.MONGODB_URI);
  await mongo.connect();
  await mongo.db('crimelab').collection('activities').insertOne({
    type: 'checkout_created',
    case_ids,
    evidence_ids,
    timestamp: new Date(),
  });
  await mongo.close();
  
  return jsonResponse({
    checkout_url: checkoutData.data.checkoutCreate.checkout.webUrl,
  });
}

// Webhook handler for completed orders
async function handleOrderWebhook(request, env) {
  const order = await request.json();
  
  // Extract case IDs from custom attributes
  const caseIdsAttr = order.note_attributes?.find(attr => attr.name === 'case_ids');
  if (!caseIdsAttr) {
    return jsonResponse({ success: false, error: 'No case IDs' });
  }
  
  const caseIds = caseIdsAttr.value.split(',').map(id => parseInt(id));
  
  // Mark cases as solved in Neon
  const neon = createClient({ connectionString: env.NEON_DATABASE_URL });
  
  for (const caseId of caseIds) {
    await neon`
      UPDATE cases 
      SET solved_at = NOW() 
      WHERE id = ${caseId} AND solved_at IS NULL
    `;
  }
  
  // Log to MongoDB
  const mongo = new MongoClient(env.MONGODB_URI);
  await mongo.connect();
  await mongo.db('crimelab').collection('activities').insertOne({
    type: 'case_solved',
    case_ids: caseIds,
    order_id: order.id,
    timestamp: new Date(),
  });
  await mongo.close();
  
  return jsonResponse({ success: true, cases_solved: caseIds.length });
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}
