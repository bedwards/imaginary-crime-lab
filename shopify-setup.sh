#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHOPIFY_DIR="$SCRIPT_DIR/shopify"

if [ "$#" -ne 2 ]; then
    echo "❌ Usage: $0 <store-name> <worker-url>"
    exit 1
fi

STORE_NAME="$1"
WORKER_URL="$2"
STORE_DOMAIN="${STORE_NAME}.myshopify.com"

if [ -z "$SHOPIFY_ADMIN_TOKEN" ]; then
    echo "❌ SHOPIFY_ADMIN_TOKEN not set"
    exit 1
fi

echo "🔬 Imaginary Crime Lab - Shopify Setup"
echo ""

export SHOPIFY_STORE="$STORE_DOMAIN"

# Create products via API
echo "🔬 Creating products..."
node "$SHOPIFY_DIR/create-products.js"

# Create webhook via API (not CLI)
echo "📡 Creating webhook..."
node "$SHOPIFY_DIR/create-webhook.js" "$WORKER_URL"

# Generate SQL
echo "📝 Generating SQL..."
node "$SHOPIFY_DIR/generate-sql.js"

echo ""
echo "✅ Setup complete!"
