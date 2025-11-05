import { Elysia, t } from 'elysia';

import {
  db,
  garageDailyOccupancy,
  garages,
  parked,
  passes,
  users,
} from '@/database/index';
import { errorResponse, successResponse } from '@/shared/index';
import { and, eq, sql } from 'drizzle-orm';

export const parkedRoutes = new Elysia({ prefix: '/api/parked' })
  .derive(() => ({
    adjustOccupancy: async (garageId: string, when: Date, delta: 1 | -1) => {
      const day = new Date(when);
      day.setHours(0, 0, 0, 0);

      const [existing] = await db
        .select()
        .from(garageDailyOccupancy)
        .where(
          and(
            (garageDailyOccupancy as any).garageId.eq?.(garageId) ??
              ({} as any),
            (garageDailyOccupancy as any).day.eq?.(day) ?? ({} as any)
          )
        )
        .limit(1);

      const hour = when.getHours();
      const ensureArray = (arr: unknown): number[] => {
        if (Array.isArray(arr) && arr.length === 24) return arr as number[];
        return Array.from({ length: 24 }, () => 0);
      };

      if (!existing) {
        const hours = ensureArray(undefined);
        hours[hour] = Math.max(0, (hours[hour] ?? 0) + delta);
        await db
          .insert(garageDailyOccupancy)
          .values({ garageId, day, hourlyOccupancy: hours } as any);
        return;
      }

      const hours = ensureArray((existing as any).hourlyOccupancy);
      hours[hour] = Math.max(0, (hours[hour] ?? 0) + delta);
      await db
        .update(garageDailyOccupancy)
        .set({ hourlyOccupancy: hours } as any)
        .where(
          and(
            (garageDailyOccupancy as any).garageId.eq?.(garageId) ??
              ({} as any),
            (garageDailyOccupancy as any).day.eq?.(day) ?? ({} as any)
          )
        );
    },
  }))
  // Create a parked entry (vehicle enters the garage)
  .post(
    '/',
    async ({ body, set, adjustOccupancy }) => {
      try {
        // Validate garage exists
        const [garage] = await db
          .select()
          .from(garages)
          .where(eq(garages.id, body.garageId))
          .limit(1);

        if (!garage) {
          set.status = 404;
          return errorResponse('Garage not found');
        }

        // Optional: Validate user and pass if provided (best-effort)
        if (body.userId) {
          const [user] = await db
            .select()
            .from(users)
            .where(eq(users.id, body.userId))
            .limit(1);
          if (!user) {
            set.status = 400;
            return errorResponse('Invalid userId');
          }
        }
        if (body.passId) {
          const [pass] = await db
            .select()
            .from(passes)
            .where(eq(passes.id, body.passId))
            .limit(1);
          if (!pass) {
            set.status = 400;
            return errorResponse('Invalid passId');
          }
        }

        const toInsert: Record<string, unknown> = {
          garageId: body.garageId,
          ...(body.userId && { userId: body.userId }),
          ...(body.passId && { passId: body.passId }),
          ...(body.vehiclePlate && { vehiclePlate: body.vehiclePlate }),
        };

        if (body.enteredAt) {
          toInsert['enteredAt'] = new Date(body.enteredAt);
        }

        const [row] = await db
          .insert(parked)
          .values(toInsert as any)
          .returning();

        const entered = body.enteredAt
          ? new Date(body.enteredAt)
          : new Date((row as any).enteredAt);
        await adjustOccupancy(body.garageId, entered, 1);

        set.status = 201;
        return successResponse(row, 'Vehicle entry recorded');
      } catch (error) {
        set.status = 400;
        return errorResponse(
          error instanceof Error
            ? error.message
            : 'Failed to create parked entry'
        );
      }
    },
    {
      body: t.Object({
        garageId: t.String({ format: 'uuid' }),
        userId: t.Optional(t.String({ format: 'uuid' })),
        passId: t.Optional(t.String({ format: 'uuid' })),
        vehiclePlate: t.Optional(t.String({ maxLength: 32 })),
        enteredAt: t.Optional(t.String({ format: 'date-time' })),
      }),
      detail: {
        tags: ['parked'],
        summary: 'Create parked entry',
        description: 'Logs a vehicle entering a garage.',
      },
    }
  )
  // Read parked entries (optionally filter by garageId and active)
  .get(
    '/',
    async ({ query, set }) => {
      try {
        const conditions = [] as any[];
        if (query.garageId)
          conditions.push(eq(parked.garageId, query.garageId));
        if (query.active === 'true')
          conditions.push(sql`${parked.exitedAt} IS NULL`);
        if (query.active === 'false')
          conditions.push(sql`${parked.exitedAt} IS NOT NULL`);

        const whereExpr = conditions.length ? and(...conditions) : sql`true`;

        const rows = await db
          .select()
          .from(parked)
          .where(whereExpr)
          .limit(query.limit ? Number(query.limit) : 100);

        return successResponse(rows, 'Parked entries retrieved');
      } catch (error) {
        set.status = 400;
        return errorResponse(
          error instanceof Error
            ? error.message
            : 'Failed to fetch parked entries'
        );
      }
    },
    {
      query: t.Object({
        garageId: t.Optional(t.String({ format: 'uuid' })),
        active: t.Optional(t.Union([t.Literal('true'), t.Literal('false')])),
        limit: t.Optional(t.String()),
      }),
      detail: {
        tags: ['parked'],
        summary: 'List parked entries',
        description:
          'Returns parked entries. Filters: garageId, active (true/false), limit (default 100).',
      },
    }
  )
  // Read single parked entry
  .get(
    '/:id',
    async ({ params: { id }, set }) => {
      const [row] = await db
        .select()
        .from(parked)
        .where(eq(parked.id, id))
        .limit(1);
      if (!row) {
        set.status = 404;
        return errorResponse('Parked entry not found');
      }
      return successResponse(row, 'Parked entry retrieved');
    },
    {
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      detail: {
        tags: ['parked'],
        summary: 'Get parked entry',
        description: 'Returns a single parked log entry by ID.',
      },
    }
  )
  // Update parked entry (e.g., set exitedAt when vehicle leaves, update plate)
  .put(
    '/:id',
    async ({ params: { id }, body, set, adjustOccupancy }) => {
      const toUpdate: Record<string, unknown> = {};
      if (body.vehiclePlate !== undefined)
        toUpdate['vehiclePlate'] = body.vehiclePlate;
      if (body.exitedAt !== undefined)
        toUpdate['exitedAt'] = body.exitedAt ? new Date(body.exitedAt) : null;

      if (Object.keys(toUpdate).length === 0) {
        return errorResponse('No fields to update');
      }

      const [before] = await db
        .select()
        .from(parked)
        .where(eq(parked.id, id))
        .limit(1);

      const [updated] = await db
        .update(parked)
        .set(toUpdate as any)
        .where(eq(parked.id, id))
        .returning();

      if (!updated) {
        set.status = 404;
        return errorResponse('Parked entry not found');
      }

      if (
        body.exitedAt !== undefined &&
        body.exitedAt !== null &&
        (!before || (before as any).exitedAt === null)
      ) {
        const exited = new Date(body.exitedAt);
        await adjustOccupancy((updated as any).garageId, exited, -1);
      }

      return successResponse(updated, 'Parked entry updated');
    },
    {
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Object({
        vehiclePlate: t.Optional(t.String({ maxLength: 32 })),
        exitedAt: t.Optional(
          t.Union([t.String({ format: 'date-time' }), t.Null()])
        ),
      }),
      detail: {
        tags: ['parked'],
        summary: 'Update parked entry',
        description:
          'Updates a parked entry. Common action: set exitedAt timestamp when vehicle leaves.',
      },
    }
  );
