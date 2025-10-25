// shopify/generate-sql.js
const fs = require('fs');
const path = require('path');

const productIdsFile = path.join(__dirname, 'product-ids.json');
const products = JSON.parse(fs.readFileSync(productIdsFile, 'utf8'));

const CASE_EVIDENCE_MAP = {
    1: ['FINGERPRINT_CARD', 'GUEST_MANIFEST', 'SECURITY_LOG', 'FIBER_SAMPLE'],
    2: ['TEMPERATURE_LOG', 'CHEMICAL_RESIDUE', 'ENCRYPTED_DIARY', 'AUTOPSY_REPORT', 'EXPERIMENT_LOG'],
    3: ['BLOOD_SPATTER', 'CIPHER_KEY', 'HANDWRITING_SAMPLE', 'INK_ANALYSIS', 'PURCHASE_RECORDS', 'DMV_PHOTOS'],
    4: ['PAINT_COMPOSITION', 'UV_FLUORESCENCE', 'SHIPPING_MANIFEST', 'AUTH_CERTIFICATES', 'SUPPLIER_LEDGER']
};

let sql = `-- Imaginary Crime Lab - Product ID Updates
-- Generated: ${new Date().toISOString()}
-- Copy these statements into your Neon SQL Editor

DELETE FROM case_evidence; -- Clear existing mappings

`;

Object.entries(CASE_EVIDENCE_MAP).forEach(([caseId, handles]) => {
    sql += `\n-- Case ${caseId}\n`;
    handles.forEach(handle => {
        if (products[handle]) {
            sql += `INSERT INTO case_evidence (case_id, evidence_id, is_critical) VALUES (${caseId}, '${products[handle].id}', true);\n`;
        } else {
            sql += `-- WARNING: ${handle} not found in product-ids.json\n`;
        }
    });
});

sql += `\n-- Product ID Reference:\n`;
Object.entries(products).forEach(([handle, data]) => {
    sql += `-- ${handle}: ${data.id} (${data.title})\n`;
});

const outputFile = path.join(__dirname, 'update-neon.sql');
fs.writeFileSync(outputFile, sql);
console.log(`✅ SQL generated: ${outputFile}`);