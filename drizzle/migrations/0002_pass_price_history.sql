-- Migration: Add pass price history tracking
-- This tracks all price changes for passes over time

-- Create pass_price_history table
CREATE TABLE IF NOT EXISTS pass_price_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pass_id UUID NOT NULL REFERENCES passes(id) ON DELETE CASCADE,
    old_price DECIMAL(10, 2),
    new_price DECIMAL(10, 2) NOT NULL,
    old_stripe_price_id VARCHAR(255),
    new_stripe_price_id VARCHAR(255),
    changed_by VARCHAR(255), -- Could be user ID or 'system'
    change_reason TEXT,
    effective_date TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS pass_price_history_pass_idx ON pass_price_history(pass_id);
CREATE INDEX IF NOT EXISTS pass_price_history_effective_date_idx ON pass_price_history(effective_date);

-- Comment for documentation
COMMENT ON TABLE pass_price_history IS 
'Tracks historical price changes for passes. Each row represents a price change event.';

COMMENT ON COLUMN pass_price_history.old_price IS 
'Previous price before the change. NULL for initial price.';

COMMENT ON COLUMN pass_price_history.new_price IS 
'New price after the change.';

COMMENT ON COLUMN pass_price_history.effective_date IS 
'When this price change took effect.';

COMMENT ON COLUMN pass_price_history.changed_by IS 
'Identifier of who made the change (user ID, admin name, or "system").';

