import { Elysia, t } from 'elysia';

import { db, garages, payments, subscriptions } from '@/database/index';
import { errorResponse, successResponse } from '@/shared/index';
import { and, eq, gte, lte, sql } from 'drizzle-orm';

export const garageRoutes = new Elysia({ prefix: '/api/garages' })
  // Get all garages
  .get(
    '/',
    async () => {
      const allGarages = await db.select().from(garages);
      return successResponse(allGarages);
    },
    {
      detail: {
        tags: ['garages'],
        summary: 'Get all garages',
        description: 'Returns a list of all garages',
      },
    }
  )
  // Get garage by ID
  .get(
    '/:id',
    async ({ params: { id }, set }) => {
      const [garage] = await db
        .select()
        .from(garages)
        .where(eq(garages.id, id))
        .limit(1);

      if (!garage) {
        set.status = 404;
        return errorResponse('Garage not found');
      }

      return successResponse(garage);
    },
    {
      params: t.Object({
        id: t.String({ format: 'uuid' }),
      }),
      detail: {
        tags: ['garages'],
        summary: 'Get garage by ID',
        description: 'Returns a single garage by its ID',
      },
    }
  )
  // Create garage
  .post(
    '/',
    async ({ body, set }) => {
      try {
        const [newGarage] = await db
          .insert(garages)
          .values(body)
          .returning();
        set.status = 201;
        return successResponse(newGarage, 'Garage created successfully');
      } catch (error) {
        set.status = 400;
        return errorResponse(
          error instanceof Error ? error.message : 'Failed to create garage'
        );
      }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 255 }),
        address: t.String({ minLength: 1, maxLength: 500 }),
        stripeAccountId: t.Optional(t.String({ maxLength: 255 })),
      }),
      detail: {
        tags: ['garages'],
        summary: 'Create garage',
        description: 'Creates a new garage',
      },
    }
  )
  // Update garage
  .put(
    '/:id',
    async ({ params: { id }, body, set }) => {
      try {
        const [updatedGarage] = await db
          .update(garages)
          .set(body)
          .where(eq(garages.id, id))
          .returning();

        if (!updatedGarage) {
          set.status = 404;
          return errorResponse('Garage not found');
        }

        return successResponse(
          updatedGarage,
          'Garage updated successfully'
        );
      } catch (error) {
        set.status = 400;
        return errorResponse(
          error instanceof Error ? error.message : 'Failed to update garage'
        );
      }
    },
    {
      params: t.Object({
        id: t.String({ format: 'uuid' }),
      }),
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
        address: t.Optional(t.String({ minLength: 1, maxLength: 500 })),
        stripeAccountId: t.Optional(t.String({ maxLength: 255 })),
      }),
      detail: {
        tags: ['garages'],
        summary: 'Update garage',
        description: 'Updates an existing garage',
      },
    }
  )
  // Get P&L for specific garage
  .get(
    '/:id/pl',
    async ({ params: { id: garageId }, query, set }) => {
      try {
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

        // Parse date filters (optional)
        const startDate = query.startDate
          ? new Date(query.startDate)
          : new Date(new Date().getFullYear(), 0, 1); // Default: start of year
        const endDate = query.endDate
          ? new Date(query.endDate)
          : new Date(); // Default: today

        // Get payment data for the garage
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
      } catch (error) {
        console.error('Error calculating P&L:', error);
        set.status = 500;
        return errorResponse(
          error instanceof Error ? error.message : 'Failed to calculate P&L'
        );
      }
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
        tags: ['garages'],
        summary: 'Get garage P&L',
        description: 'Returns profit and loss data for a specific garage',
      },
    }
  )
  // Get metrics for garage dashboard
  .get(
    '/:id/metrics',
    async ({ params: { id: garageId }, set }) => {
      try {
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

        const subData = subMetrics[0];
        const monthData = monthlyMetrics[0];

        return successResponse({
          garage: {
            id: garage.id,
            name: garage.name,
          },
          metrics: {
            activeSubscriptions: subData?.activeSubscriptions || 0,
            monthlyRecurringRevenue: parseFloat(
              subData?.monthlyRecurringRevenue || '0'
            ),
            currentMonthPayments: monthData?.monthlyPayments || 0,
            currentMonthRevenue: parseFloat(
              monthData?.monthlyRevenue || '0'
            ),
          },
        });
      } catch (error) {
        console.error('Error calculating metrics:', error);
        set.status = 500;
        return errorResponse(
          error instanceof Error
            ? error.message
            : 'Failed to calculate metrics'
        );
      }
    },
    {
      params: t.Object({
        id: t.String({ format: 'uuid' }),
      }),
      detail: {
        tags: ['garages'],
        summary: 'Get garage metrics',
        description: 'Returns KPIs and metrics for garage dashboard',
      },
    }
  );

