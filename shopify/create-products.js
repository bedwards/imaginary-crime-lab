// shopify/create-products.js
const fs = require('fs');
const path = require('path');

const productsFile = path.join(__dirname, 'evidence-products.json');
const products = JSON.parse(fs.readFileSync(productsFile, 'utf8'));

async function createProduct(product, storeDomain, accessToken) {
    const response = await fetch(`https://${storeDomain}/admin/api/2024-10/products.json`, {
        method: 'POST',
        headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ product }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return response.json();
}

async function main() {
    const storeDomain = process.env.SHOPIFY_STORE;
    const accessToken = process.env.SHOPIFY_ADMIN_TOKEN;

    if (!storeDomain || !accessToken) {
        console.error('❌ Missing environment variables:');
        console.error('   SHOPIFY_STORE and SHOPIFY_ADMIN_TOKEN required');
        process.exit(1);
    }

    const results = {};

    for (const product of products) {
        try {
            const result = await createProduct(product, storeDomain, accessToken);
            console.log(`✅ ${product.title}`);
            console.log(`   ID: ${result.product.id}`);

            results[product.handle] = {
                id: result.product.id,
                title: result.product.title,
                price: product.variants[0].price
            };

            // Rate limiting: 2 requests per second
            await new Promise(resolve => setTimeout(resolve, 500));

        } catch (error) {
            console.error(`❌ ${product.title}: ${error.message}`);
        }
    }

    // Save results
    const outputFile = path.join(__dirname, 'product-ids.json');
    fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
    console.log(`\n💾 Product IDs saved to: ${outputFile}`);
}

main();