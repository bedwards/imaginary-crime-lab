-- Neon Postgres Schema for Imaginary Crime Lab
-- Structured, durable data: cases, evidence mappings, analytics

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Cases table - the core investigative units
CREATE TABLE cases (
    id SERIAL PRIMARY KEY,
    case_number VARCHAR(20) UNIQUE NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    solution TEXT NOT NULL,
    difficulty VARCHAR(20) DEFAULT 'medium',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    solved_at TIMESTAMP NULL,
    CONSTRAINT valid_difficulty CHECK (difficulty IN ('easy', 'medium', 'hard'))
);

-- Evidence items are stored in Shopify, this is just the mapping
-- to cases. Think of this as the join table that defines puzzles.
CREATE TABLE case_evidence (
    id SERIAL PRIMARY KEY,
    case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    evidence_id VARCHAR(50) NOT NULL, -- Shopify product ID
    is_critical BOOLEAN DEFAULT true, -- Must have to solve?
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(case_id, evidence_id)
);

-- Purchase history - denormalized for analytics
-- Written once per completed Shopify order
CREATE TABLE purchases (
    id SERIAL PRIMARY KEY,
    order_id VARCHAR(100) UNIQUE NOT NULL, -- Shopify order ID
    evidence_ids TEXT[] NOT NULL, -- Array of product IDs
    case_ids INTEGER[] NOT NULL, -- Cases solved by this purchase
    total_amount DECIMAL(10, 2) NOT NULL,
    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    shopify_webhook_received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Analytics rollup - updated periodically by Worker
CREATE TABLE case_analytics (
    id SERIAL PRIMARY KEY,
    case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    views INTEGER DEFAULT 0,
    cart_adds INTEGER DEFAULT 0,
    completions INTEGER DEFAULT 0,
    avg_time_to_solve_minutes INTEGER NULL,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Purchased evidence - global tracking of what has been bought
-- Single global state, no per-user tracking
CREATE TABLE purchased_evidence (
    evidence_id VARCHAR(50) PRIMARY KEY, -- Shopify product ID
    purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    order_id VARCHAR(100) NOT NULL -- Shopify order ID that purchased it
);

-- Indexes for performance
CREATE INDEX idx_cases_solved ON cases(solved_at);
CREATE INDEX idx_case_evidence_case ON case_evidence(case_id);
CREATE INDEX idx_case_evidence_evidence ON case_evidence(evidence_id);
CREATE INDEX idx_purchases_completed ON purchases(completed_at);
CREATE INDEX idx_analytics_case ON case_analytics(case_id);
CREATE INDEX idx_purchased_evidence_order ON purchased_evidence(order_id);

-- Seed data: Initial cases
INSERT INTO cases (case_number, title, description, solution, difficulty) VALUES
('C-2024-001', 'The Missing Heirloom', 
 'A 19th century pocket watch vanished from the Blackwood Estate during a dinner party. Five guests, no witnesses. The thief left traces.',
 'The butler did it. Cross-referencing the fingerprint card with the guest manifest and the timeline from the security log reveals he was alone in the study during the critical window. The fiber sample from his jacket matches the velvet case lining.',
 'easy'),

('C-2024-002', 'The Locked Room Mystery',
 'Dr. Chen was found dead in his laboratory. The door was locked from inside, windows sealed. No weapon, no obvious cause. His final experiment log is the key.',
 'Suicide by cryogenic exposure. The temperature log shows he deliberately disabled safety protocols. The chemical residue proves he inhaled liquid nitrogen vapor. His encrypted diary reveals financial ruin and terminal diagnosis.',
 'medium'),

('C-2024-003', 'The Cipher Killer',
 'Three victims across three cities, each with a coded message carved into their palm. Police are stumped. The pattern emerges when you overlay evidence.',
 'The killer is spelling coordinates. The blood spatter analysis combined with the cipher key reveals GPS locations of future victims. The handwriting sample matches a disgraced cryptography professor. Comparing purchase records of the rare ink to DMV photos closes the case.',
 'hard'),

('C-2024-004', 'The Forgery Ring',
 'Counterfeit Monet paintings are flooding the black market. The forgeries are exceptional, but forensic analysis reveals microscopic tells.',
 'Paint composition analysis matches a discontinued pigment available only through one supplier. The UV fluorescence pattern under forensic light reveals modern binding agents. Cross-referencing shipping manifests with the handwriting on the authentication certificates leads to a restoration studio in Prague.',
 'medium');

-- Evidence requirements for each case
-- These reference Shopify product IDs (you'll update these after creating products)
INSERT INTO case_evidence (case_id, evidence_id, is_critical) VALUES
-- Case 1: Missing Heirloom (4 pieces)
(1, 'FINGERPRINT_CARD', true),
(1, 'GUEST_MANIFEST', true),
(1, 'SECURITY_LOG', true),
(1, 'FIBER_SAMPLE', true),

-- Case 2: Locked Room (5 pieces)
(2, 'TEMPERATURE_LOG', true),
(2, 'CHEMICAL_RESIDUE', true),
(2, 'ENCRYPTED_DIARY', true),
(2, 'AUTOPSY_REPORT', true),
(2, 'EXPERIMENT_LOG', true),

-- Case 3: Cipher Killer (6 pieces - hardest)
(3, 'BLOOD_SPATTER', true),
(3, 'CIPHER_KEY', true),
(3, 'HANDWRITING_SAMPLE', true),
(3, 'INK_ANALYSIS', true),
(3, 'PURCHASE_RECORDS', true),
(3, 'DMV_PHOTOS', true),

-- Case 4: Forgery Ring (5 pieces)
(4, 'PAINT_COMPOSITION', true),
(4, 'UV_FLUORESCENCE', true),
(4, 'SHIPPING_MANIFEST', true),
(4, 'AUTH_CERTIFICATES', true),
(4, 'SUPPLIER_LEDGER', true);

-- Initialize analytics
INSERT INTO case_analytics (case_id, views, cart_adds, completions)
SELECT id, 0, 0, 0 FROM cases;

-- View: Active unsolved cases with evidence counts
CREATE VIEW active_cases_summary AS
SELECT 
    c.id,
    c.case_number,
    c.title,
    c.difficulty,
    COUNT(ce.evidence_id) as required_evidence_count,
    c.created_at
FROM cases c
LEFT JOIN case_evidence ce ON c.id = ce.case_id
WHERE c.solved_at IS NULL
GROUP BY c.id, c.case_number, c.title, c.difficulty, c.created_at
ORDER BY c.case_number;

-- View: Solved cases with solve time
CREATE VIEW solved_cases_summary AS
SELECT 
    c.id,
    c.case_number,
    c.title,
    c.solved_at,
    EXTRACT(EPOCH FROM (c.solved_at - c.created_at))/3600 as hours_to_solve
FROM cases c
WHERE c.solved_at IS NOT NULL
ORDER BY c.solved_at DESC;

-- Function: Mark case as solved (called by Worker on order webhook)
CREATE OR REPLACE FUNCTION solve_case(p_case_id INTEGER)
RETURNS VOID AS $$
BEGIN
    UPDATE cases 
    SET solved_at = CURRENT_TIMESTAMP 
    WHERE id = p_case_id AND solved_at IS NULL;
    
    UPDATE case_analytics
    SET completions = completions + 1,
        last_updated = CURRENT_TIMESTAMP
    WHERE case_id = p_case_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Record purchase and solve cases
CREATE OR REPLACE FUNCTION record_purchase(
    p_order_id VARCHAR(100),
    p_evidence_ids TEXT[],
    p_case_ids INTEGER[],
    p_total DECIMAL(10, 2)
)
RETURNS INTEGER AS $$
DECLARE
    v_case_id INTEGER;
BEGIN
    -- Insert purchase record
    INSERT INTO purchases (order_id, evidence_ids, case_ids, total_amount)
    VALUES (p_order_id, p_evidence_ids, p_case_ids, p_total);
    
    -- Solve each case
    FOREACH v_case_id IN ARRAY p_case_ids
    LOOP
        PERFORM solve_case(v_case_id);
    END LOOP;
    
    RETURN array_length(p_case_ids, 1);
END;
$$ LANGUAGE plpgsql;

-- Trigger: Update analytics on case view (in real system this would be from Worker)
CREATE OR REPLACE FUNCTION update_case_analytics()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE case_analytics
    SET views = views + 1,
        last_updated = CURRENT_TIMESTAMP
    WHERE case_id = NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE cases IS 'Core investigative cases - the puzzles users solve by buying evidence';
COMMENT ON TABLE case_evidence IS 'Maps Shopify product IDs to cases - defines what evidence solves which case';
COMMENT ON TABLE purchases IS 'Denormalized purchase history from Shopify webhooks';
COMMENT ON TABLE case_analytics IS 'Rollup metrics for monitoring and optimization';
COMMENT ON FUNCTION solve_case IS 'Atomically marks a case as solved and updates analytics';
COMMENT ON FUNCTION record_purchase IS 'Records a completed Shopify order and triggers case solving';
