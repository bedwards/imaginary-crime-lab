// Cloudflare Worker - API Gateway for Imaginary Crime Lab
// Updated for Cloudflare Workers compatibility

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
      return jsonResponse({ error: error.message }, 500);
    }
  },
};

// Use Neon's HTTP API instead of the serverless client
async function queryNeon(env, query, params = []) {
  const response = await fetch('https://api.neon.tech/sql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.NEON_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      params,
      database_url: env.NEON_DATABASE_URL,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Neon query failed: ${response.statusText}`);
  }
  
  const result = await response.json();
  return result.rows || [];
}

// Use MongoDB Data API instead of the Node.js driver
async function queryMongoDB(env, collection, operation, document = {}) {
  const url = new URL(env.MONGODB_URI);
  const database = url.pathname.slice(1) || 'crimelab';
  
  const response = await fetch(`${env.MONGODB_DATA_API}/action/${operation}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/ejson',
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
    throw new Error(`MongoDB operation failed: ${response.statusText}`);
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
  
  // Return mock data if Shopify is not configured
  if (!env.SHOPIFY_STOREFRONT_TOKEN) {
    const mockEvidence = [
      { id: 'FINGERPRINT_CARD', name: 'Fingerprint Analysis Card', description: 'Lifted prints from the crime scene', price: '29.00' },
      { id: 'GUEST_MANIFEST', name: 'Dinner Party Guest Manifest', description: 'Official guest list', price: '15.00' },
      { id: 'SECURITY_LOG', name: 'Estate Security Log', description: '24-hour security camera logs', price: '25.00' },
      { id: 'FIBER_SAMPLE', name: 'Forensic Fiber Sample', description: 'Microscopic fiber analysis', price: '35.00' },
      { id: 'TEMPERATURE_LOG', name: 'Laboratory Temperature Log', description: 'Automated temperature monitoring', price: '20.00' },
    ];
    return jsonResponse(mockEvidence, 200, { 'X-Cache': 'MOCK' });
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
  
  if (!shopifyResponse.ok) {
    return jsonResponse({ error: 'Failed to fetch from Shopify' }, 500);
  }
  
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

// Get metrics
async function handleGetMetrics(env) {
  // Return mock metrics if database is not configured
  if (!env.NEON_API_KEY) {
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
async function handleActivityStream(env) {
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
  
  // Return mock checkout URL if Shopify is not configured
  if (!env.SHOPIFY_STOREFRONT_TOKEN) {
    return jsonResponse({
      checkout_url: 'https://example.myshopify.com/checkout/mock',
      mock: true
    });
  }
  
  // Get evidence details
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
  
  return jsonResponse({
    checkout_url: checkoutData.data?.checkoutCreate?.checkout?.webUrl || 'https://example.myshopify.com/checkout',
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
  
  // If databases are configured, update them
  if (env.NEON_API_KEY) {
    for (const caseId of caseIds) {
      await queryNeon(env, 
        'UPDATE cases SET solved_at = NOW() WHERE id = $1 AND solved_at IS NULL',
        [caseId]
      );
    }
  }
  
  if (env.MONGODB_API_KEY) {
    await queryMongoDB(env, 'activities', 'insertOne', {
      type: 'case_solved',
      case_ids: caseIds,
      order_id: order.id,
      timestamp: new Date(),
    });
  }
  
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
