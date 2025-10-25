const storeDomain = process.env.SHOPIFY_STORE;
const accessToken = process.env.SHOPIFY_ADMIN_TOKEN;
const workerUrl = process.argv[2];

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
    console.log(`✅ Webhook created: ${result.webhook.id}`);
}

createWebhook();
