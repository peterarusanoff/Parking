-- Migration: Add RBAC for garage admins
-- This adds role-based access control and garage ownership management

-- Create user role enum
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('user', 'garage_admin', 'super_admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add role column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS role user_role DEFAULT 'user' NOT NULL;

-- Create garage_admins junction table (many-to-many)
CREATE TABLE IF NOT EXISTS garage_admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    garage_id UUID NOT NULL REFERENCES garages(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES users(id),
    assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
    permissions JSONB DEFAULT '{"view_reports": true, "manage_passes": true, "manage_subscriptions": true}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, garage_id)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS garage_admins_user_idx ON garage_admins(user_id);
CREATE INDEX IF NOT EXISTS garage_admins_garage_idx ON garage_admins(garage_id);
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);

-- Comment for documentation
COMMENT ON TABLE garage_admins IS 
'Maps garage administrators to the garages they manage. A user can manage multiple garages.';

COMMENT ON COLUMN users.role IS 
'User role: "user" (regular customer), "garage_admin" (manages garages), "super_admin" (full access)';

COMMENT ON COLUMN garage_admins.permissions IS 
'JSON object defining specific permissions for this admin on this garage';

-- Function to check if user is admin of garage
CREATE OR REPLACE FUNCTION is_garage_admin(p_user_id UUID, p_garage_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM users u
        LEFT JOIN garage_admins ga ON ga.user_id = u.id
        WHERE u.id = p_user_id
        AND (
            u.role = 'super_admin'
            OR (u.role = 'garage_admin' AND ga.garage_id = p_garage_id)
        )
    );
END;
$$ LANGUAGE plpgsql;

-- Function to get garages managed by user
CREATE OR REPLACE FUNCTION get_managed_garages(p_user_id UUID)
RETURNS TABLE (garage_id UUID) AS $$
BEGIN
    -- Super admins see all garages
    IF EXISTS (SELECT 1 FROM users WHERE id = p_user_id AND role = 'super_admin') THEN
        RETURN QUERY SELECT id FROM garages;
    -- Garage admins see only their garages
    ELSE
        RETURN QUERY 
        SELECT ga.garage_id 
        FROM garage_admins ga 
        WHERE ga.user_id = p_user_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

