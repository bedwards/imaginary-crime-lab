# Shopify Integration Setup Guide

## The Truth: What Actually Works

**Skip the Shopify CLI entirely.** It's for theme developers and embedded app developers. You're doing neither.

## Prerequisites

- Shopify store (development or paid)
- Node.js installed locally
- Your Cloudflare Worker URL ready

## Step 1: Create Custom App in Shopify Admin

### 1.1 Navigate to Your Store Admin
```
https://admin.shopify.com/store/your-store-name
```

### 1.2 Enable Custom App Development
```
Settings → Apps and sales channels → Develop apps
```

If you don't see "Develop apps", first enable it:
- Look for "Custom app development" toggle
- Enable it

### 1.3 Create the App
- Click "Create an app"
- Name: "Crime Lab Integration" (or any name)
- Click "Create app"

### 1.4 Configure API Scopes

**Admin API scopes:**
- Click "Configure Admin API scopes"
- Enable these permissions:
  - `read_products`
  - `write_products` 
  - `read_orders`
  - `write_orders`
- Save

**Storefront API scopes:**
- Click "Configure Storefront API scopes"  
- Enable these permissions:
  - `unauthenticated_read_products`
  - `unauthenticated_read_product_listings`
  - `unauthenticated_write_checkouts`
  - `unauthenticated_read_checkouts`
- Save

### 1.5 Install the App
- Click "Install app" button
- Confirm installation

### 1.6 Get Your Tokens
- Go to "API credentials" tab
- Under "Admin API access token":
  - Click "Reveal token once"
  - **Copy immediately** (you can only see it once!)
  - Token format: `shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
- Under "Storefront API access token":
  - Copy this token too
  - Token format: `shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

## Step 2: Create Products and Webhook

### 2.1 Save Your Setup Script

Create `shopify-setup.js`:

```javascript
const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const WORKER_URL = process.env.WORKER_URL;

const products = [
  { handle: "FINGERPRINT_CARD", title: "Fingerprint Analysis Card", price: "29.00" },
  { handle: "GUEST_MANIFEST", title: "Dinner Party Guest Manifest", price: "15.00" },
  { handle: "SECURITY_LOG", title: "Estate Security Log", price: "25.00" },
  { handle: "FIBER_SAMPLE", title: "Forensic Fiber Sample", price: "35.00" },
  { handle: "TEMPERATURE_LOG", title: "Laboratory Temperature Log", price: "20.00" },
  { handle: "CHEMICAL_RESIDUE", title: "Chemical Residue Analysis", price: "40.00" },
  { handle: "ENCRYPTED_DIARY", title: "Encrypted Personal Diary", price: "30.00" },
  { handle: "AUTOPSY_REPORT", title: "Official Autopsy Report", price: "45.00" },
  { handle: "EXPERIMENT_LOG", title: "Final Experiment Log", price: "25.00" },
  { handle: "BLOOD_SPATTER", title: "Blood Spatter Pattern Analysis", price: "50.00" },
  { handle: "CIPHER_KEY", title: "Cryptographic Cipher Key", price: "35.00" },
  { handle: "HANDWRITING_SAMPLE", title: "Handwriting Comparison Sample", price: "30.00" },
  { handle: "INK_ANALYSIS", title: "Forensic Ink Analysis", price: "40.00" },
  { handle: "PURCHASE_RECORDS", title: "Supplier Purchase Records", price: "25.00" },
  { handle: "DMV_PHOTOS", title: "DMV Photo Database Access", price: "20.00" },
  { handle: "PAINT_COMPOSITION", title: "Paint Composition Analysis", price: "45.00" },
  { handle: "UV_FLUORESCENCE", title: "UV Fluorescence Report", price: "40.00" },
  { handle: "SHIPPING_MANIFEST", title: "International Shipping Manifest", price: "30.00" },
  { handle: "AUTH_CERTIFICATES", title: "Authentication Certificates", price: "35.00" },
  { handle: "SUPPLIER_LEDGER", title: "Supplier Financial Ledger", price: "25.00" }
];

async function createProduct(product) {
  const response = await fetch(
    `https://${SHOPIFY_STORE}/admin/api/2024-10/products.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        product: {
          title: product.title,
          handle: product.handle.toLowerCase(),
          body_html: `Evidence item for crime scene investigation`,
          vendor: 'Crime Lab Forensics',
          product_type: 'Evidence',
          tags: 'evidence, forensic, case-material',
          variants: [{
            price: product.price,
            inventory_policy: 'continue',
            requires_shipping: false
          }]
        }
      })
    }
  );
  
  return response.json();
}

async function createWebhook() {
  const response = await fetch(
    `https://${SHOPIFY_STORE}/admin/api/2024-10/webhooks.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        webhook: {
          topic: 'orders/create',
          address: `${WORKER_URL}/webhook/order`,
          format: 'json'
        }
      })
    }
  );
  
  return response.json();
}

async function main() {
  console.log('🚀 Starting Shopify setup...\n');
  
  const productIds = {};
  const sqlStatements = [];
  
  // Create products
  for (const product of products) {
    try {
      console.log(`Creating ${product.handle}...`);
      const result = await createProduct(product);
      
      if (result.product) {
        productIds[product.handle] = result.product.id;
        sqlStatements.push(
          `UPDATE evidence SET shopify_id = '${result.product.id}' WHERE id = '${product.handle}';`
        );
        console.log(`✅ Created: ${product.title}`);
      } else {
        console.log(`❌ Failed: ${product.title}`);
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`❌ Error creating ${product.handle}:`, error.message);
    }
  }
  
  // Create webhook
  console.log('\nCreating order webhook...');
  try {
    const webhook = await createWebhook();
    console.log('✅ Webhook created');
  } catch (error) {
    console.error('❌ Webhook creation failed:', error.message);
  }
  
  // Output SQL for Neon
  console.log('\n📝 SQL statements for Neon:\n');
  console.log(sqlStatements.join('\n'));
  
  // Save product IDs
  require('fs').writeFileSync(
    'product-ids.json',
    JSON.stringify(productIds, null, 2)
  );
  
  console.log('\n✅ Setup complete!');
  console.log('Product IDs saved to product-ids.json');
}

main().catch(console.error);
```

### 2.2 Run the Setup Script

```bash
SHOPIFY_STORE=your-store.myshopify.com \
SHOPIFY_ADMIN_TOKEN=shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
WORKER_URL=https://crime-lab-api.your-worker.workers.dev \
node shopify-setup.js
```

### 2.3 Update Your Database

Copy the SQL statements from the script output and run them in your Neon database to link products to evidence records.

## Step 3: Configure Your Worker

Your Cloudflare Worker needs these environment variables:

```bash
# Via wrangler CLI
wrangler secret put SHOPIFY_STOREFRONT_TOKEN
wrangler secret put SHOPIFY_ADMIN_TOKEN
```

Or in `wrangler.toml`:
```toml
[vars]
SHOPIFY_STORE_DOMAIN = "your-store.myshopify.com"
```

## What You DON'T Need

❌ **Shopify CLI** - It's for theme developers and embedded apps  
❌ **Partners Account** - Only needed for public apps  
❌ **OAuth flow** - Custom apps use permanent tokens  
❌ **App deployment to Shopify** - Your Worker IS the integration  
❌ **Liquid templates** - You're using headless commerce  
❌ **Theme files** - React frontend handles all UI  

## How It Actually Works

1. **Products live in Shopify** - Just regular products in your store catalog
2. **Your Worker calls Shopify APIs** - Using the tokens you got from Admin UI
3. **React frontend talks to your Worker** - Never directly to Shopify
4. **Shopify sends webhooks to your Worker** - When orders are created
5. **Worker orchestrates everything** - It's the glue between all services

## The Integration Architecture

```
User Browser
     ↓
React Frontend (GitHub Pages)
     ↓
Cloudflare Worker (Your API)
     ↓
Shopify APIs (GraphQL/REST)
     ↑
Webhooks back to Worker
```

## Testing Your Setup

### Verify Products Created
```bash
curl -X GET "https://your-store.myshopify.com/admin/api/2024-10/products.json" \
  -H "X-Shopify-Access-Token: shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

### Verify Webhook Registered
```bash
curl -X GET "https://your-store.myshopify.com/admin/api/2024-10/webhooks.json" \
  -H "X-Shopify-Access-Token: shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

### Test Storefront Access
```bash
curl -X POST "https://your-store.myshopify.com/api/2024-10/graphql.json" \
  -H "X-Shopify-Storefront-Access-Token: shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ products(first: 5) { edges { node { title } } } }"}'
```

## Common Issues and Solutions

### "Can't create custom app"
- Development stores sometimes block custom apps
- Solution: Enable "Custom app development" in settings
- Or use a paid Shopify plan (even Basic at $39/month)

### "Token not working"
- You only see the Admin token ONCE when creating it
- Solution: Delete the app and create a new one if you lost it

### "Products not showing"
- Check that products are active and visible in online store
- Verify Storefront API permissions are enabled

### "Webhook not firing"
- Check webhook URL is publicly accessible
- Verify your Worker is deployed and running
- Look for webhook notifications in Shopify admin

## Summary

The entire Shopify integration is just:
1. **2 minutes** - Get tokens from Shopify Admin UI
2. **1 minute** - Run setup script to create products/webhook  
3. **Done** - Your Worker handles everything else

No Shopify CLI. No Partners account hassles. No OAuth complexity. Just tokens and API calls.