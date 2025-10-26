This system, the Imaginary Crime Lab, operates as a **transparent, distributed application** designed to showcase its own architecture. It uses a clean separation of concerns across multiple serverless platforms for production.

The final state of the architecture and best practices for production operation are detailed below, broken down by component and operational task.

---

## I. Final Production Architecture State

| Component | Role in Production | Data Stored/Handled | Key Configuration Files |
| :--- | :--- | :--- | :--- |
| **React Frontend** | Static UI (Single Page Application) | Pure UI state, consumes API data | `frontend/dist` (built assets), `vite.config.js` |
| **Cloudflare Workers** | Orchestration Layer / API Gateway | Proxies Shopify, runs GraphQL to Neon, streams MongoDB activity | `worker.js`, `wrangler.toml` |
| **Neon Postgres** | Durable Truth / System of Record | Cases, evidence requirements, long-term analytics | `neon-schema.sql` |
| **MongoDB Atlas** | Live Heartbeat / Ephemeral State | Real-time interaction traces, transient flags, activity signals | `mongodb-schema.js` |
| **Shopify** | Commerce Authority | Products, pricing, inventory, checkout | Admin UI (Custom App) |

---

## II. Initial Production Setup and Data Seeding

The system relies on external API tokens and initial data seeding into Shopify and Neon before deployment.

### A. Shopify Setup and Data Seeding (Standard Method)

The final, working method for Shopify integration avoids the Shopify CLI and focuses on a simple **Legacy Custom App**.

1.  **Create Custom App and Get Tokens:**
    *   Navigate to your Shopify Partner Dashboard and create a Development Store.
    *   Go to your store’s admin URL (`https://admin.shopify.com/store/your-store-name`).
    *   Navigate to **Settings → Apps and sales channels → Develop apps**.
    *   Click the button to **"Allow legacy custom app development"** (if restricted).
    *   Create a new Custom App (e.g., "Crime Lab Integration").
    *   **Configure Admin API Scopes** by enabling: `read_products`, `write_products`, `read_orders`, and `write_orders`.
    *   **Enable Storefront API**.
    *   Install the app and immediately **copy the Admin API Access Token** and the **Storefront API Access Token**. These are required as environment secrets.

2.  **Seed Products and Webhooks:**
    *   Use the repository's setup script (`shopify-setup.sh`) and supporting Node.js scripts (`create-products.js`, `create-webhook.js`) to perform bulk operations.
    *   Set the necessary environment variables and run the script:
        ```bash
        export SHOPIFY_ADMIN_TOKEN=shpat_xxxxx
        ./shopify-setup.sh imaginary-crime-lab https://crime-lab-api.your-worker.workers.dev
        ```
    *   This script automatically:
        *   **Creates all 20 evidence products** in Shopify via the Admin API.
        *   **Creates the `orders/create` webhook** pointing directly to your deployed Cloudflare Worker URL (e.g., `https://your-worker.workers.dev/webhook/order`).

3.  **Publish Products:**
    *   **Ensure the newly created products are published to the "Online Store" sales channel**. If they are not published to a channel, the Shopify Storefront API will return an empty list, and the UI will show no evidence.

### B. Neon Postgres Setup and Data Seeding (Standard Method)

1.  **Database Creation and Credentials:**
    *   Set up the database in the **Neon console**.
    *   Copy the **Neon Connection String (URL)**, which is required as the `NEON_DATABASE_URL` secret.
    *   Generate a **regular Neon API key** from **Account Settings → API Keys** (not the Data API Beta). This is required as the `NEON_API_KEY` secret.

2.  **Seeding Initial Schema and Cases:**
    *   Go to the **Neon console SQL Editor**.
    *   **Paste and execute the contents of `neon-schema.sql`**. This creates the tables and inserts the initial cases.

3.  **Mapping Shopify IDs:**
    *   The `shopify-setup.sh` script generates **`update-neon.sql`**.
    *   This file contains `INSERT INTO case_evidence` statements that map the newly created Shopify Product IDs to the `case_id`s in your Neon database.
    *   **Paste and execute the contents of `update-neon.sql`** in the Neon console SQL Editor to finalize the data relationships.

### C. MongoDB Atlas Setup and Data Seeding

1.  **Setup and Credentials:**
    *   Set up your cluster in MongoDB Atlas.
    *   Obtain the **MongoDB URI**, required as the `MONGODB_URI` secret.

2.  **Seeding:**
    *   For production, the **collections will auto-create** when the Worker performs its first write operation.
    *   For manual seeding (if required), commands from `mongodb-init.js` can be run in the Atlas shell to create collections and test activities.

---

## III. Deployment and Continuous Integration (CI/CD)

The system deploys the Worker to Cloudflare and the Frontend to GitHub Pages using GitHub Actions (`.github/workflows/deploy.yml`).

### A. Cloudflare Workers Deployment

The final, robust deployment method uses explicit Wrangler CLI commands in GitHub Actions:

| Setting | Value | Why |
| :--- | :--- | :--- |
| **CI/CD Build Step** | `npm install` | **Critical fix:** Required to install Node.js dependencies like `@neondatabase/serverless` before bundling the Worker. |
| **Deploy Command** | `npx wrangler deploy --env production` | Explicitly deploys the `worker.js` using the configuration defined in `wrangler.toml`. |
| **API Token** | **Project-specific Cloudflare API Token** | Should have **Workers Scripts:Edit** permissions and be named clearly (e.g., `crime-lab-worker-deploy`) for clarity and security. |

### B. GitHub Pages (Frontend) Deployment

1.  **Configure Repository:** Go to GitHub Repository **Settings → Pages**.
    *   Under "Source," select **"Deploy from a branch."**
    *   Set **Branch:** `gh-pages` and Directory: `/ (root)`.

2.  **Configure CI/CD:** The workflow must include the following fixes:
    *   **Permissions:** The deploy job (`deploy-frontend`) must explicitly request write access to push the build to the `gh-pages` branch:
        ```yaml
        permissions:
          contents: write
        ```
    *   **Build-Time API URL:** The frontend requires its API URL at build time. This is passed via the `VITE_API_BASE` environment variable, which must be configured as a **GitHub Actions Secret** (e.g., `https://crime-lab-api.your-worker.workers.dev`).
    *   **Vite Configuration:** Ensure `frontend/vite.config.js` uses the correct base path matching the repository name (e.g., `base: '/imaginary-crime-lab/'`).

### C. Setting Runtime Secrets

**Secrets must be set manually once** in the **Cloudflare Dashboard**, not in the deployment workflow.

1.  Navigate to **Workers & Pages → Your Worker → Settings → Variables**.
2.  Add the following as **Environment Variables** (as encrypted secrets):
    *   `NEON_DATABASE_URL`
    *   `MONGODB_URI`
    *   `SHOPIFY_STOREFRONT_TOKEN`
    *   `SHOPIFY_ADMIN_TOKEN`

---

## IV. Debugging and Troubleshooting (Production)

### A. Logs and Monitoring

The most effective way to debug the production Worker is using the command line.

| Component | Tool / Location | Command / Action | Purpose |
| :--- | :--- | :--- | :--- |
| **Cloudflare Worker (Runtime Errors)** | **Wrangler CLI** | **`wrangler tail --env production`** | Provides **real-time logs** and stack traces for Worker errors (like Neon query failures or timeouts). |
| **Cloudflare Worker (Historical Errors)** | **Cloudflare Dashboard** | Workers & Pages → Your Worker → Logs tab | Review recent errors and request details. |
| **Frontend** | **Browser Devtools** | Console and Network tabs | Diagnose API call failures, environment variable mismatches, and UI rendering issues. |
| **Neon Database** | **Neon Console** | SQL Editor | Verify data integrity and manually test queries if the Worker returns empty results. |

### B. Troubleshooting Best Practices

1.  **API Failure (Empty Data):** If the UI or API endpoint returns empty data (but a successful HTTP status), the issue is likely a **backend data retrieval failure** (Shopify or Neon). Use `wrangler tail --env production` to check the Worker logs for the exact GraphQL or SQL error.

2.  **Worker Timeout (Error 1042):** This indicates the Worker crashed or timed out. Common causes include:
    *   Missing environment secrets (e.g., `NEON_DATABASE_URL`).
    *   Incorrect database API usage (e.g., the `queryNeon` function must use `sql.query(query, params)` syntax for dynamic queries).

3.  **GitHub Actions Build Failure:** If the build fails to resolve modules like `@neondatabase/serverless`, the corresponding job is missing the **`npm install`** step.

4.  **Checking Endpoints:** To quickly verify integration integrity, use `curl`:
    *   To verify Neon integration: `curl https://crime-lab-api.your-worker.workers.dev/cases` (Should return the 4 seeded cases).
    *   To verify Commerce endpoint: `curl https://crime-lab-api.your-worker.workers.dev/evidence` (Should return all 20 Shopify products).

5.  **CORS/Networking:** Although CORS pre-flight requests (`OPTIONS`) might succeed (returning `200 OK`), this does **not** guarantee the actual `GET` or `POST` request will succeed. Always verify the subsequent request's body and server-side logs.