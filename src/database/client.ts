import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { env } from '@/env';

import * as schema from './schema';

// Normalize DATABASE_URL to avoid unsupported query params like `schema`
const databaseUrlObject = new URL(env.DATABASE_URL);
// Some environments add `?schema=public` (Prisma-style). postgres.js will try to SET this as a parameter
// which Postgres rejects ("unrecognized configuration parameter \"schema\""). Strip it safely.
databaseUrlObject.searchParams.delete('schema');

// Create postgres client
export const sql = postgres(databaseUrlObject.toString(), {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

// Create drizzle instance with schema
export const db = drizzle(sql, { schema });

// Type-safe database instance
export type Database = typeof db;
