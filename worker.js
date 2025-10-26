// Cloudflare Worker - API Gateway for Imaginary Crime Lab

import { neon } from '@neondatabase/serverless';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env, _) {
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
      return jsonResponse({ error: error.message }, 500);
    }
  },
};

async function queryNeon(env, query, params = []) {
  const sql = neon(env.NEON_DATABASE_URL);

  if (params.length > 0) {
    // Parameterized query
    const result = await sql.query(query, params);
    return result.rows;
  }

  const result = await sql.query(query, params);
  return result.rows || result;
}

// Use MongoDB Data API instead of the Node.js driver
async function queryMongoDB(env, collection, operation, document = {}) {
  const url = new URL(env.MONGODB_URI);
  const database = url.pathname.slice(1) || 'crimelab';

  const response = await fetch(`${env.MONGODB_DATA_API} /action/${operation} `, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': env.MONGODB_API_KEY,
    },
    body: JSON.stringify({
      dataSource: env.MONGODB_CLUSTER || 'Cluster0',
      database,
      collection,
      document,
    }),
  });

  if (!response.ok) {
    throw new Error(`MongoDB operation failed: ${response.statusText} `);
  }

  return response.json();
}

// Get cases from Neon Postgres
async function handleGetCases(env) {
  // For now, return mock data if database is not configured
  if (!env.NEON_API_KEY) {
    return jsonResponse([
      {
        id: 1,
        number: 'C-2024-001',
        title: 'The Missing Heirloom',
        description: 'A 19th century pocket watch vanished from the Blackwood Estate during a dinner party.',
        solution: 'The butler did it.',
        solved_at: null,
        required_evidence: ['FINGERPRINT_CARD', 'GUEST_MANIFEST', 'SECURITY_LOG', 'FIBER_SAMPLE']
      },
      {
        id: 2,
        number: 'C-2024-002',
        title: 'The Locked Room Mystery',
        description: 'Dr. Chen was found dead in his laboratory. The door was locked from inside.',
        solution: 'Suicide by cryogenic exposure.',
        solved_at: null,
        required_evidence: ['TEMPERATURE_LOG', 'CHEMICAL_RESIDUE', 'ENCRYPTED_DIARY', 'AUTOPSY_REPORT', 'EXPERIMENT_LOG']
      }
    ]);
  }

  const result = await queryNeon(env, `
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
    `);

  return jsonResponse(result);
}

// Get evidence from Shopify Admin API (REST)
async function handleGetEvidence(env) {
  // Check Worker cache first
  const cache = caches.default;
  const cacheKey = new Request('https://cache/evidence', { method: 'GET' });
  // let response = await cache.match(cacheKey);

  // if (response) {
  //   const data = await response.json();
  //   return jsonResponse(data, 200, { 'X-Cache': 'HIT' });
  // }

  // Return mock data if Shopify is not configured
  if (!env.SHOPIFY_ADMIN_TOKEN) {
    throw new Error("Must set SHOPIFY_ADMIN_TOKEN");
  }

  // Fetch from Shopify Admin REST API
  const shopifyResponse = await fetch(
    `https://${env.SHOPIFY_STORE_DOMAIN}/admin/api/2025-10/products.json?limit=50`,
    {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': env.SHOPIFY_ADMIN_TOKEN,
      },
    }
  );

  if (!shopifyResponse.ok) {
    return jsonResponse({ error: 'Failed to fetch from Shopify' }, 500);
  }

  const shopifyData = await shopifyResponse.json();

  // Transform to our format
  const evidence = shopifyData.products.map((product) => ({
    id: product.id.toString(),
    name: product.title,
    description: product.body_html?.replace(/<[^>]*>/g, '') || '', // Strip HTML
    price: product.variants[0]?.price || '0.00',
    variant_id: `gid://shopify/ProductVariant/${product.variants[0]?.id}`,
  }));

  console.log('Fetched evidence:', JSON.stringify(evidence.slice(0, 2), null, 2));

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
  if (!env.NEON_DATABASE_URL) {
    return jsonResponse({
      total_cases: 4,
      solved_cases: 0,
      evidence_count: 20,
      worker_timestamp: new Date().toISOString(),
    });
  }

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
}

// Post activity to MongoDB
async function handlePostActivity(request, env) {
  const activity = await request.json();

  // If MongoDB is not configured, just log and return success
  if (!env.MONGODB_API_KEY) {
    console.log('Activity:', activity);
    return jsonResponse({ success: true, mock: true });
  }

  await queryMongoDB(env, 'activities', 'insertOne', {
    ...activity,
    timestamp: new Date(),
    worker_id: crypto.randomUUID(),
  });

  return jsonResponse({ success: true });
}

// Server-Sent Events for live activity
async function handleActivityStream(_) {
  const encoder = new TextEncoder();

  // Create a simple SSE stream with mock data
  const stream = new ReadableStream({
    start(controller) {
      // Send initial data
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        type: 'connection_established',
        timestamp: new Date().toISOString()
      })}\n\n`));

      // Send periodic updates
      const interval = setInterval(() => {
        const mockActivity = {
          type: 'connection_count',
          count: Math.floor(Math.random() * 10) + 1,
          timestamp: new Date().toISOString()
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(mockActivity)}\n\n`));
      }, 5000);

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

// Create Shopify checkout
async function handleCreateCheckout(request, env) {
  const { evidence_ids, case_ids } = await request.json();

  if (!env.SHOPIFY_STOREFRONT_TOKEN) {
    throw new Error("Must set SHOPIFY_STOREFRONT_TOKEN");
  }

  const evidenceResponse = await handleGetEvidence(env);
  const allEvidence = await evidenceResponse.json();
  const selectedEvidence = allEvidence.filter(e => evidence_ids.includes(e.id));

  // Filter out evidence with invalid/missing variants
  const validEvidence = selectedEvidence.filter(e => {
    if (!e.variant_id || e.variant_id.includes('undefined')) {
      console.warn(`Skipping evidence ${e.id}: invalid variant_id`);
      return false;
    }
    return true;
  });

  if (validEvidence.length === 0) {
    console.error('No valid evidence items found for checkout');
    return jsonResponse({
      checkout_url: 'https://crime-lab.myshopify.com',
      error: 'No valid items in cart'
    });
  }

  const lines = validEvidence.map(e => ({
    merchandiseId: e.variant_id,
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
              { key: 'case_ids', value: case_ids.join(',') }
            ],
          },
        },
      }),
    }
  );

  const checkoutData = await shopifyResponse.json();
  const checkoutUrl = checkoutData.data?.checkoutCreate?.checkout?.webUrl;
  if (!checkoutUrl) {
    const data = JSON.stringify(checkoutData, null, 2);
    console.log(`checkout_data: ${data}`);
  } else {
    console.log(`checkout_url: ${checkoutUrl}`);
  }

  return jsonResponse({
    checkout_url: checkoutUrl || 'https://crime-lab.myshopify.com',
  });
}

// Webhook handler for completed orders
async function handleOrderWebhook(request, env) {
  const order = await request.json();

  // Log the entire payload for debugging
  console.log('=== ORDER WEBHOOK RECEIVED ===');
  console.log('Order ID:', order.id);
  console.log('Custom attrs:', JSON.stringify(order.customAttributes || []));
  console.log('Note attrs:', JSON.stringify(order.note_attributes || []));
  console.log('Full order keys:', Object.keys(order).join(', '));

  if (!env.NEON_DATABASE_URL) {
    return jsonResponse({ success: false, error: 'Database not configured' });
  }

  const customAttrs = order.customAttributes || order.note_attributes || [];
  const caseIdsAttr = customAttrs.find(attr => attr.key === 'case_ids' || attr.name === 'case_ids');

  if (!caseIdsAttr?.value) {
    console.error('❌ No case_ids found');
    console.error('Available attributes:', JSON.stringify(customAttrs));
    // Don't fail - just return success so Shopify doesn't retry
    return jsonResponse({ success: true, warning: 'No case_ids found' });
  }

  const caseIds = caseIdsAttr.value.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));

  if (caseIds.length === 0) {
    console.error('❌ Invalid case_ids:', caseIdsAttr.value);
    return jsonResponse({ success: true, warning: 'Invalid case_ids' });
  }

  const productIds = order.line_items?.map(item => item.product_id.toString()) || [];
  const sql = neon(env.NEON_DATABASE_URL);

  console.log('✅ Solving cases:', caseIds);

  await sql`
    UPDATE cases 
    SET solved_at = NOW() 
    WHERE id = ANY(${caseIds}::int[]) AND solved_at IS NULL
  `;

  await sql`
    INSERT INTO purchases (order_id, evidence_ids, case_ids, total_amount)
    VALUES (
      ${order.id.toString()}, 
      ${productIds}::text[], 
      ${caseIds}::int[], 
      ${order.total_price}
    )
  `;

  if (env.MONGODB_API_KEY) {
    await queryMongoDB(env, 'activities', 'insertOne', {
      type: 'case_solved',
      case_ids: caseIds,
      order_id: order.id.toString(),
      timestamp: new Date(),
    });
  }

  console.log('✅ Webhook complete, solved', caseIds.length, 'cases');

  return jsonResponse({
    success: true,
    cases_solved: caseIds.length,
    redirect_url: 'https://bedwards.github.io/imaginary-crime-lab/'
  });
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
