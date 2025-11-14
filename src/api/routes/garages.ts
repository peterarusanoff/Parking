import { Elysia, t } from 'elysia';

import { db, garageDailyOccupancy, garages, payments, subscriptions } from '@/database/index';
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
  // Get daily occupancy (24-hour series) for a garage
  .get(
    '/:id/occupancy/daily',
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

        const day = query.date ? new Date(query.date) : new Date();
        day.setHours(0, 0, 0, 0);

        const [row] = await db
          .select()
          .from(garageDailyOccupancy)
          .where(
            and(
              eq(garageDailyOccupancy.garageId as any, garageId as any),
              eq(garageDailyOccupancy.day as any, day as any)
            )
          )
          .limit(1);

        const hours = Array.isArray((row as any)?.hourlyOccupancy)
          ? (row as any).hourlyOccupancy
          : Array.from({ length: 24 }, () => 0);

        return successResponse({
          garage: { id: garage.id, name: garage.name },
          date: day.toISOString(),
          hourly: hours,
        });
      } catch (error) {
        set.status = 500;
        return errorResponse(
          error instanceof Error ? error.message : 'Failed to load occupancy'
        );
      }
    },
    {
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      query: t.Object({ date: t.Optional(t.String({ format: 'date' })) }),
      detail: {
        tags: ['garages'],
        summary: 'Get daily occupancy',
        description: 'Returns hourly occupancy array for a given day (24 values).',
      },
    }
  )
  // Get week occupancy vs 2-week average comparison (hour-by-hour)
  .get(
    '/:id/occupancy/comparison',
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

        // Determine week start (default: current week Monday)
        const ref = query.weekStart ? new Date(query.weekStart) : new Date();
        const weekStart = new Date(ref);
        const dayOfWeek = (weekStart.getDay() + 6) % 7; // Mon=0
        weekStart.setDate(weekStart.getDate() - dayOfWeek);
        weekStart.setHours(0, 0, 0, 0);

        const dates: Date[] = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(weekStart);
          d.setDate(weekStart.getDate() + i);
          return d;
        });

        const previous14Start = new Date(weekStart);
        previous14Start.setDate(previous14Start.getDate() - 14);

        // Fetch rows for current week
        const currentRows = await db
          .select()
          .from(garageDailyOccupancy)
          .where(
            and(
              eq(garageDailyOccupancy.garageId as any, garageId as any),
              gte(garageDailyOccupancy.day as any, weekStart as any),
              lte(
                garageDailyOccupancy.day as any,
                new Date(weekStart.getTime() + 6 * 24 * 3600 * 1000) as any
              )
            )
          );

        // Fetch rows for previous two weeks
        const priorRows = await db
          .select()
          .from(garageDailyOccupancy)
          .where(
            and(
              eq(garageDailyOccupancy.garageId as any, garageId as any),
              gte(garageDailyOccupancy.day as any, previous14Start as any),
              lte(
                garageDailyOccupancy.day as any,
                new Date(weekStart.getTime() - 24 * 3600 * 1000) as any
              )
            )
          );

        const toKey = (d: Date) => d.toISOString();
        const currentByDay = new Map(
          currentRows.map((r: any) => [new Date(r.day).toISOString(), r])
        );

        const currentWeek: number[][] = dates.map((d) => {
          const row = currentByDay.get(toKey(d));
          return Array.isArray(row?.hourlyOccupancy)
            ? (row.hourlyOccupancy as number[])
            : Array.from({ length: 24 }, () => 0);
        });

        // Compute average per hour over prior 14 days
        const priorHours: number[] = Array.from({ length: 24 }, () => 0);
        const priorCounts: number[] = Array.from({ length: 24 }, () => 0);
        for (const r of priorRows as any[]) {
          const hours: number[] = Array.isArray(r.hourlyOccupancy)
            ? (r.hourlyOccupancy as number[])
            : Array.from({ length: 24 }, () => 0);
          for (let h = 0; h < 24; h++) {
            priorHours[h] += hours[h] ?? 0;
            priorCounts[h] += 1;
          }
        }
        const priorAvg: number[] = priorHours.map((sum, i) =>
          priorCounts[i] > 0 ? sum / priorCounts[i] : 0
        );

        return successResponse({
          garage: { id: garage.id, name: garage.name },
          weekStart: weekStart.toISOString(),
          currentWeek,
          priorTwoWeekAvg: priorAvg,
        });
      } catch (error) {
        set.status = 500;
        return errorResponse(
          error instanceof Error
            ? error.message
            : 'Failed to load occupancy comparison'
        );
      }
    },
    {
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      query: t.Object({
        weekStart: t.Optional(t.String({ format: 'date' })),
      }),
      detail: {
        tags: ['garages'],
        summary: 'Get weekly occupancy vs 2-week average',
        description:
          'Returns 7 daily series (24 hours each) and prior two-week hourly average.',
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
            totalRevenue: Number(data?.totalRevenue || 0),
            totalFees: Number(data?.totalFees || 0),
            netRevenue: Number(data?.totalNet || 0),
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
            monthlyRecurringRevenue: Number(subData?.monthlyRecurringRevenue || 0),
            currentMonthPayments: monthData?.monthlyPayments || 0,
            currentMonthRevenue: Number(monthData?.monthlyRevenue || 0),
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

