require('dotenv').config({ path: '../.env' });
const storeDomain = process.env.SHOPIFY_STORE_DOMAIN;
const accessToken = process.env.SHOPIFY_ADMIN_TOKEN;
const workerUrl = process.env.VITE_API_BASE;

async function createWebhook() {
    const response = await fetch(
        `https://${storeDomain}/admin/api/2024-10/webhooks.json`,
        {
            method: 'POST',
            headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                webhook: {
                    topic: 'orders/create',
                    address: `${workerUrl}/webhook/order`,
                    format: 'json'
                }
            })
        }
    );

    const result = await response.json();

    if (!response.ok || result.errors) {
        console.error('❌ Error:', JSON.stringify(result, null, 2));
        process.exit(1);
    }

    console.log(`✅ Webhook created: ${result.webhook.id}`);
}

createWebhook();
