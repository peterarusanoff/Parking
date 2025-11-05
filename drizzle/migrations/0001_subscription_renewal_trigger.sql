-- Migration: Add subscription renewal trigger
-- This trigger detects when subscriptions are about to expire and marks them for renewal

-- Create an enum for renewal status if it doesn't exist
DO $$ BEGIN
    CREATE TYPE renewal_status AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add renewal tracking columns to subscriptions table
ALTER TABLE subscriptions 
ADD COLUMN IF NOT EXISTS renewal_status renewal_status DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS renewal_attempted_at timestamp,
ADD COLUMN IF NOT EXISTS next_renewal_date timestamp;

-- Create index for renewal queries
CREATE INDEX IF NOT EXISTS subscriptions_renewal_status_idx ON subscriptions(renewal_status);
CREATE INDEX IF NOT EXISTS subscriptions_next_renewal_date_idx ON subscriptions(next_renewal_date);

-- Function to update next renewal date
CREATE OR REPLACE FUNCTION update_next_renewal_date()
RETURNS TRIGGER AS $$
BEGIN
    -- If subscription is active and has a current period end, set next renewal date
    IF NEW.status = 'active' AND NEW.current_period_end IS NOT NULL THEN
        NEW.next_renewal_date := NEW.current_period_end;
        NEW.renewal_status := 'pending';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update renewal date
DROP TRIGGER IF EXISTS subscription_renewal_trigger ON subscriptions;
CREATE TRIGGER subscription_renewal_trigger
    BEFORE INSERT OR UPDATE OF current_period_end, status
    ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_next_renewal_date();

-- Function to find subscriptions that need renewal (within 7 days)
CREATE OR REPLACE FUNCTION find_expiring_subscriptions(days_ahead integer DEFAULT 7)
RETURNS TABLE (
    subscription_id uuid,
    user_id uuid,
    pass_id uuid,
    garage_id uuid,
    stripe_subscription_id varchar,
    days_until_expiry integer
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id,
        s.user_id,
        s.pass_id,
        s.garage_id,
        s.stripe_subscription_id,
        EXTRACT(DAY FROM (s.current_period_end - NOW()))::integer as days_until_expiry
    FROM subscriptions s
    WHERE s.status = 'active'
        AND s.renewal_status = 'pending'
        AND s.current_period_end IS NOT NULL
        AND s.current_period_end <= NOW() + (days_ahead || ' days')::interval
        AND s.current_period_end > NOW()
        AND s.cancel_at_period_end = false
    ORDER BY s.current_period_end ASC;
END;
$$ LANGUAGE plpgsql;

-- Comment for documentation
COMMENT ON FUNCTION find_expiring_subscriptions(integer) IS 
'Finds active subscriptions that will expire within the specified number of days. Default is 7 days.';

COMMENT ON COLUMN subscriptions.renewal_status IS 
'Tracks the renewal processing status: pending (awaiting renewal), processing (renewal in progress), completed (successfully renewed), failed (renewal failed)';

COMMENT ON COLUMN subscriptions.next_renewal_date IS 
'The date when this subscription should be renewed, automatically set to current_period_end';

