#!/usr/bin/env bun

import { readFileSync } from 'fs';
import { join } from 'path';

import { db } from '../src/database/client';
import { sql } from 'drizzle-orm';

/**
 * Apply RBAC migration for garage admins
 */
async function applyRBACMigration() {
  try {
    console.log('📋 Applying RBAC migration for garage admins...');

    const migrationPath = join(
      process.cwd(),
      'drizzle/migrations/0003_rbac_garage_admins.sql'
    );
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    // Execute the migration
    await db.execute(sql.raw(migrationSQL));

    console.log('✅ RBAC migration applied successfully!');
    console.log('');
    console.log('New features:');
    console.log('  - User roles: user, garage_admin, super_admin');
    console.log('  - garage_admins junction table');
    console.log('  - is_garage_admin() function');
    console.log('  - get_managed_garages() function');
    console.log('');
    console.log('New endpoints:');
    console.log('  - GET /api/admin/my-garages');
    console.log('  - GET /api/admin/garages/:id/dashboard');
    console.log('  - GET /api/admin/garages/:id/reports/pl');
    console.log('  - POST /api/admin/garage-admins');

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

applyRBACMigration();

