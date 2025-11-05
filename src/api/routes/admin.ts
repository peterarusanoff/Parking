import { Elysia, t } from 'elysia';

import {
  db,
  garageAdmins,
  garages,
  passes,
  payments,
  subscriptions,
  users,
} from '@/database/index';
import { errorResponse, successResponse } from '@/shared/index';
import { and, eq, gte, lte, sql } from 'drizzle-orm';

import {
  forbiddenResponse,
  getCurrentUser,
  getManagedGarages,
  hasRole,
  isGarageAdmin,
  unauthorizedResponse,
} from '../middleware/auth';

export const adminRoutes = new Elysia({ prefix: '/api/admin' })
  // List garage admin users (super admin only). Optional filter by garageId
  .get(
    '/garage-admins',
    async (context) => {
      const { query, set } = context;
      const currentUser = await getCurrentUser(context);

      if (!currentUser) {
        set.status = 401;
        return unauthorizedResponse();
      }

      if (!hasRole(currentUser.role, ['super_admin'])) {
        set.status = 403;
        return forbiddenResponse('Only super admins can list admin users');
      }

      // Get all assignments, optionally filtered by garage
      const assignments = await db
        .select()
        .from(garageAdmins)
        .where(
          query.garageId ? eq(garageAdmins.garageId, query.garageId) : sql`true`
        );

      // Get unique userIds and garageIds
      const userIds = Array.from(new Set(assignments.map((a) => a.userId)));
      const garageIds = Array.from(new Set(assignments.map((a) => a.garageId)));

      // Fetch users and garages
      const admins = userIds.length
        ? await db
            .select()
            .from(users)
            .where(
              sql`${users.id} = ANY(ARRAY[${sql.raw(userIds.map((id) => `'${id}'`).join(','))}]::uuid[])`
            )
        : [];
      const garageList = garageIds.length
        ? await db
            .select()
            .from(garages)
            .where(
              sql`${garages.id} = ANY(ARRAY[${sql.raw(garageIds.map((id) => `'${id}'`).join(','))}]::uuid[])`
            )
        : [];

      // Build response: one object per admin user with their assignments
      const adminById = new Map(admins.map((u) => [u.id, u]));
      const garageById = new Map(garageList.map((g) => [g.id, g]));

      const result = userIds
        .map((userId) => {
          const user = adminById.get(userId);
          if (!user) return null;
          const userAssignments = assignments.filter(
            (a) => a.userId === userId
          );
          return {
            user: {
              id: user.id,
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email,
              phone: user.phone,
              role: user.role,
            },
            assignments: userAssignments.map((a) => ({
              garageId: a.garageId,
              permissions: a.permissions,
              assignedAt: a.assignedAt,
              garage: garageById.get(a.garageId)
                ? {
                    id: garageById.get(a.garageId)!.id,
                    name: garageById.get(a.garageId)!.name,
                    address: garageById.get(a.garageId)!.address,
                  }
                : undefined,
            })),
          };
        })
        .filter(Boolean);

      return successResponse(result, 'Garage admins retrieved');
    },
    {
      query: t.Object({
        garageId: t.Optional(t.String({ format: 'uuid' })),
      }),
      detail: {
        tags: ['admin'],
        summary: 'List garage admins',
        description:
          'Returns all garage admin users with their garage assignments (super admin only). Optional filter by garageId.',
      },
    }
  )
  // Get a specific garage admin by user ID (super admin only)
  .get(
    '/garage-admins/:userId',
    async (context) => {
      const { params, set } = context;
      const { userId } = params;
      const currentUser = await getCurrentUser(context);

      if (!currentUser) {
        set.status = 401;
        return unauthorizedResponse();
      }

      if (!hasRole(currentUser.role, ['super_admin'])) {
        set.status = 403;
        return forbiddenResponse('Only super admins can view admin users');
      }

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!user || user.role !== 'garage_admin') {
        set.status = 404;
        return errorResponse('Garage admin user not found');
      }

      const assignments = await db
        .select()
        .from(garageAdmins)
        .where(eq(garageAdmins.userId, userId));

      const garageIds = assignments.map((a) => a.garageId);
      const garageList = garageIds.length
        ? await db
            .select()
            .from(garages)
            .where(
              sql`${garages.id} = ANY(ARRAY[${sql.raw(garageIds.map((id) => `'${id}'`).join(','))}]::uuid[])`
            )
        : [];
      const garageById = new Map(garageList.map((g) => [g.id, g]));

      return successResponse(
        {
          user: {
            id: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phone: user.phone,
            role: user.role,
          },
          assignments: assignments.map((a) => ({
            garageId: a.garageId,
            permissions: a.permissions,
            assignedAt: a.assignedAt,
            garage: garageById.get(a.garageId)
              ? {
                  id: garageById.get(a.garageId)!.id,
                  name: garageById.get(a.garageId)!.name,
                  address: garageById.get(a.garageId)!.address,
                }
              : undefined,
          })),
        },
        'Garage admin retrieved'
      );
    },
    {
      params: t.Object({ userId: t.String({ format: 'uuid' }) }),
      detail: {
        tags: ['admin'],
        summary: 'Get garage admin by user ID',
        description:
          'Returns a single garage admin and all their garage assignments (super admin only).',
      },
    }
  )
  // Update a garage admin user (name/email/phone) - super admin only
  .put(
    '/garage-admins/:userId',
    async (context) => {
      const { params, body, set } = context;
      const { userId } = params;
      const currentUser = await getCurrentUser(context);

      if (!currentUser) {
        set.status = 401;
        return unauthorizedResponse();
      }

      if (!hasRole(currentUser.role, ['super_admin'])) {
        set.status = 403;
        return forbiddenResponse('Only super admins can update admin users');
      }

      // Ensure user exists and is an admin
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!user || user.role !== 'garage_admin') {
        set.status = 404;
        return errorResponse('Garage admin user not found');
      }

      const updateData: Record<string, unknown> = {};
      if (body.firstName) updateData['firstName'] = body.firstName;
      if (body.lastName) updateData['lastName'] = body.lastName;
      if (body.email) updateData['email'] = body.email;
      if (body.phone) updateData['phone'] = body.phone;

      if (Object.keys(updateData).length === 0) {
        return successResponse(user, 'No changes');
      }

      const [updated] = await db
        .update(users)
        .set(updateData as any)
        .where(eq(users.id, userId))
        .returning();

      return successResponse(updated, 'Garage admin updated');
    },
    {
      params: t.Object({ userId: t.String({ format: 'uuid' }) }),
      body: t.Object({
        firstName: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
        lastName: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
        email: t.Optional(t.String({ format: 'email', maxLength: 255 })),
        phone: t.Optional(t.String({ maxLength: 50 })),
      }),
      detail: {
        tags: ['admin'],
        summary: 'Update garage admin user',
        description:
          'Updates profile fields for a garage admin user (super admin only).',
      },
    }
  )
  // Update permissions for a specific garage assignment (super admin only)
  .put(
    '/garage-admins/:userId/assignments/:garageId',
    async (context) => {
      const { params, body, set } = context;
      const { userId, garageId } = params;
      const currentUser = await getCurrentUser(context);

      if (!currentUser) {
        set.status = 401;
        return unauthorizedResponse();
      }

      if (!hasRole(currentUser.role, ['super_admin'])) {
        set.status = 403;
        return forbiddenResponse(
          'Only super admins can update admin assignments'
        );
      }

      // Ensure assignment exists
      const [assignment] = await db
        .select()
        .from(garageAdmins)
        .where(
          and(
            eq(garageAdmins.userId, userId),
            eq(garageAdmins.garageId, garageId)
          )
        )
        .limit(1);

      if (!assignment) {
        set.status = 404;
        return errorResponse('Admin assignment not found');
      }

      const [updated] = await db
        .update(garageAdmins)
        .set({ permissions: body.permissions } as any)
        .where(
          and(
            eq(garageAdmins.userId, userId),
            eq(garageAdmins.garageId, garageId)
          )
        )
        .returning();

      return successResponse(updated, 'Admin assignment updated');
    },
    {
      params: t.Object({
        userId: t.String({ format: 'uuid' }),
        garageId: t.String({ format: 'uuid' }),
      }),
      body: t.Object({
        permissions: t.String({ minLength: 2, maxLength: 10_000 }), // JSON string
      }),
      detail: {
        tags: ['admin'],
        summary: 'Update admin assignment permissions',
        description:
          'Updates the permissions JSON for a specific admin-\u003egarage assignment (super admin only).',
      },
    }
  )
  // Get garages managed by current user
  .get(
    '/my-garages',
    async (context) => {
      const { set } = context;
      const user = await getCurrentUser(context);

      if (!user) {
        set.status = 401;
        return unauthorizedResponse();
      }

      if (!hasRole(user.role, ['garage_admin', 'super_admin'])) {
        set.status = 403;
        return forbiddenResponse('Only garage admins can access this endpoint');
      }

      const managedGarageIds = await getManagedGarages(user.id);

      if (managedGarageIds.length === 0) {
        return successResponse([], 'No managed garages found');
      }

      const managedGarages = await db
        .select()
        .from(garages)
        .where(
          sql`${garages.id} = ANY(ARRAY[${sql.raw(managedGarageIds.map((id) => `'${id}'`).join(','))}]::uuid[])`
        );

      return successResponse(managedGarages, 'Managed garages retrieved');
    },
    {
      detail: {
        tags: ['admin'],
        summary: 'Get managed garages',
        description: 'Returns all garages managed by the authenticated user',
      },
    }
  )
  // Get dashboard data for a specific garage (admin only)
  .get(
    '/garages/:id/dashboard',
    async (context) => {
      const { params, set } = context;
      const garageId = params.id;
      const user = await getCurrentUser(context);

      if (!user) {
        set.status = 401;
        return unauthorizedResponse();
      }

      if (!hasRole(user.role, ['garage_admin', 'super_admin'])) {
        set.status = 403;
        return forbiddenResponse();
      }

      // Check if user can manage this garage
      const canManage = await isGarageAdmin(user.id, garageId);
      if (!canManage) {
        set.status = 403;
        return forbiddenResponse('You do not have access to this garage');
      }

      // Get garage info
      const [garage] = await db
        .select()
        .from(garages)
        .where(eq(garages.id, garageId))
        .limit(1);

      if (!garage) {
        set.status = 404;
        return errorResponse('Garage not found');
      }

      // Get subscription metrics
      const subMetrics = await db
        .select({
          activeSubscriptions: sql<number>`COUNT(*)`,
          monthlyRecurringRevenue: sql<string>`COALESCE(SUM(${subscriptions.monthlyAmount}), 0)`,
        })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.garageId, garageId),
            eq(subscriptions.status, 'active')
          )
        );

      // Get payment metrics for current month
      const currentMonthStart = new Date();
      currentMonthStart.setDate(1);
      currentMonthStart.setHours(0, 0, 0, 0);

      const monthlyMetrics = await db
        .select({
          monthlyPayments: sql<number>`COUNT(*)`,
          monthlyRevenue: sql<string>`COALESCE(SUM(${payments.netAmount}), 0)`,
        })
        .from(payments)
        .where(
          and(
            eq(payments.garageId, garageId),
            eq(payments.status, 'succeeded'),
            gte(payments.paymentDate, currentMonthStart)
          )
        );

      // Get passes for this garage
      const garagePasses = await db
        .select()
        .from(passes)
        .where(eq(passes.garageId, garageId));

      const subData = subMetrics[0];
      const monthData = monthlyMetrics[0];

      return successResponse({
        garage: {
          id: garage.id,
          name: garage.name,
          address: garage.address,
          capacity: (garage as any).capacity,
        },
        metrics: {
          activeSubscriptions: subData?.activeSubscriptions || 0,
          monthlyRecurringRevenue: parseFloat(
            subData?.monthlyRecurringRevenue || '0'
          ),
          currentMonthPayments: monthData?.monthlyPayments || 0,
          currentMonthRevenue: parseFloat(monthData?.monthlyRevenue || '0'),
          totalPasses: garagePasses.length,
          activePasses: garagePasses.filter((p) => p.active).length,
        },
        passes: garagePasses,
      });
    },
    {
      params: t.Object({
        id: t.String({ format: 'uuid' }),
      }),
      detail: {
        tags: ['admin'],
        summary: 'Get garage dashboard',
        description:
          'Returns comprehensive dashboard data for a garage (admin only)',
      },
    }
  )
  // Get P&L report for a garage (admin only)
  .get(
    '/garages/:id/reports/pl',
    async (context) => {
      const { params, query, set } = context;
      const garageId = params.id;
      const user = await getCurrentUser(context);

      if (!user) {
        set.status = 401;
        return unauthorizedResponse();
      }

      // Check permissions
      const canManage = await isGarageAdmin(user.id, garageId);
      if (!canManage) {
        set.status = 403;
        return forbiddenResponse('You do not have access to this garage');
      }

      // Validate garage exists
      const [garage] = await db
        .select()
        .from(garages)
        .where(eq(garages.id, garageId))
        .limit(1);

      if (!garage) {
        set.status = 404;
        return errorResponse('Garage not found');
      }

      // Parse date filters
      const startDate = query.startDate
        ? new Date(query.startDate)
        : new Date(new Date().getFullYear(), 0, 1);
      const endDate = query.endDate ? new Date(query.endDate) : new Date();

      // Get payment data
      const paymentData = await db
        .select({
          totalRevenue: sql<string>`COALESCE(SUM(${payments.amount}), 0)`,
          totalFees: sql<string>`COALESCE(SUM(${payments.stripeFee}), 0)`,
          totalNet: sql<string>`COALESCE(SUM(${payments.netAmount}), 0)`,
          paymentCount: sql<number>`COUNT(*)`,
        })
        .from(payments)
        .where(
          and(
            eq(payments.garageId, garageId),
            gte(payments.paymentDate, startDate),
            lte(payments.paymentDate, endDate),
            eq(payments.status, 'succeeded')
          )
        );

      const data = paymentData[0];

      return successResponse({
        garage: {
          id: garage.id,
          name: garage.name,
          address: garage.address,
          capacity: (garage as any).capacity,
        },
        period: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
        financials: {
          totalRevenue: parseFloat(data?.totalRevenue || '0'),
          totalFees: parseFloat(data?.totalFees || '0'),
          netRevenue: parseFloat(data?.totalNet || '0'),
          paymentCount: data?.paymentCount || 0,
        },
      });
    },
    {
      params: t.Object({
        id: t.String({ format: 'uuid' }),
      }),
      query: t.Object({
        startDate: t.Optional(t.String({ format: 'date' })),
        endDate: t.Optional(t.String({ format: 'date' })),
      }),
      detail: {
        tags: ['admin'],
        summary: 'Get garage P&L report',
        description: 'Returns profit and loss report for a garage (admin only)',
      },
    }
  )
  // Assign user as garage admin (super admin only)
  .post(
    '/garage-admins',
    async (context) => {
      const { body, set } = context;
      const user = await getCurrentUser(context);

      if (!user) {
        set.status = 401;
        return unauthorizedResponse();
      }

      if (!hasRole(user.role, ['super_admin'])) {
        set.status = 403;
        return forbiddenResponse('Only super admins can assign garage admins');
      }

      try {
        // Check if target user exists
        const [targetUser] = await db
          .select()
          .from(users)
          .where(eq(users.id, body.userId))
          .limit(1);

        if (!targetUser) {
          set.status = 404;
          return errorResponse('User not found');
        }

        // Update user role if needed
        if (targetUser.role !== 'garage_admin') {
          await db
            .update(users)
            .set({ role: 'garage_admin' } as any)
            .where(eq(users.id, body.userId));
        }

        // Create garage admin assignment
        const [assignment] = await db
          .insert(garageAdmins)
          .values({
            userId: body.userId,
            garageId: body.garageId,
            assignedBy: user.id,
            permissions:
              body.permissions ||
              '{"view_reports": true, "manage_passes": true, "manage_subscriptions": true}',
          } as any)
          .returning();

        set.status = 201;
        return successResponse(
          assignment,
          'Garage admin assigned successfully'
        );
      } catch (error) {
        set.status = 400;
        return errorResponse(
          error instanceof Error
            ? error.message
            : 'Failed to assign garage admin'
        );
      }
    },
    {
      body: t.Object({
        userId: t.String({ format: 'uuid' }),
        garageId: t.String({ format: 'uuid' }),
        permissions: t.Optional(t.String()),
      }),
      detail: {
        tags: ['admin'],
        summary: 'Assign garage admin',
        description: 'Assigns a user as admin of a garage (super admin only)',
      },
    }
  );
