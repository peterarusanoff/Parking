import type { Context } from 'elysia';

import { db, garageAdmins, users } from '@/database/index';
import type { UserRole } from '@/database/schema';
import { eq, sql } from 'drizzle-orm';

/**
 * Mock authentication - In production, replace with JWT/session validation
 * For now, we'll use a header: x-user-id
 */
export async function getCurrentUser(context: Context) {
  const userId = context.request.headers.get('x-user-id');

  if (!userId) {
    return null;
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user || null;
}

/**
 * Check if user has a specific role
 */
export function hasRole(userRole: UserRole | null, allowedRoles: UserRole[]): boolean {
  if (!userRole) return false;
  return allowedRoles.includes(userRole);
}

/**
 * Check if user is admin of a specific garage
 */
export async function isGarageAdmin(
  userId: string,
  garageId: string
): Promise<boolean> {
  // Check if super admin
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (user?.role === 'super_admin') {
    return true;
  }

  // Check if garage admin for this specific garage
  if (user?.role === 'garage_admin') {
      const [assignment] = await db
        .select()
        .from(garageAdmins)
        .where(
          sql`${garageAdmins.userId} = ${userId} AND ${garageAdmins.garageId} = ${garageId}`
        )
        .limit(1);

    return !!assignment;
  }

  return false;
}

/**
 * Get all garages a user can manage
 */
export async function getManagedGarages(userId: string): Promise<string[]> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return [];
  }

  // Super admins can manage all garages
  if (user.role === 'super_admin') {
    return []; // In production, query all garage IDs
  }

  // Garage admins can manage their assigned garages
  if (user.role === 'garage_admin') {
    const assignments = await db
      .select({ garageId: garageAdmins.garageId })
      .from(garageAdmins)
      .where(eq(garageAdmins.userId, userId));

    return assignments.map((a) => a.garageId);
  }

  return [];
}

/**
 * Authorization error response
 */
export function unauthorizedResponse() {
  return {
    success: false,
    error: 'Unauthorized: Authentication required',
  };
}

export function forbiddenResponse(message = 'Insufficient permissions') {
  return {
    success: false,
    error: `Forbidden: ${message}`,
  };
}

