import { Elysia, t } from 'elysia';

import {
  getPassPriceHistory,
  updatePassPrice,
} from '@/billing/pass-price-management';
import {
  migrateAllSubscriptionsForPass,
  previewPriceMigration,
} from '@/billing/subscription-price-migration';
import { db, passes } from '@/database/index';
import { errorResponse, successResponse } from '@/shared/index';
import { eq } from 'drizzle-orm';

export const passRoutes = new Elysia({ prefix: '/api/passes' })
  // Get all passes
  .get(
    '/',
    async () => {
      const allPasses = await db.select().from(passes);
      return successResponse(allPasses);
    },
    {
      detail: {
        tags: ['passes'],
        summary: 'Get all passes',
        description: 'Returns a list of all passes',
      },
    }
  )
  // Get pass by ID
  .get(
    '/:id',
    async ({ params: { id }, set }) => {
      const [pass] = await db
        .select()
        .from(passes)
        .where(eq(passes.id, id))
        .limit(1);

      if (!pass) {
        set.status = 404;
        return errorResponse('Pass not found');
      }

      return successResponse(pass);
    },
    {
      params: t.Object({
        id: t.String({ format: 'uuid' }),
      }),
      detail: {
        tags: ['passes'],
        summary: 'Get pass by ID',
        description: 'Returns a single pass by its ID',
      },
    }
  )
  // Create pass
  .post(
    '/',
    async ({ body, set }) => {
      try {
        const [newPass] = await db
          .insert(passes)
          .values({
            ...body,
            monthlyAmount: body.monthlyAmount.toString(),
          })
          .returning();
        set.status = 201;
        return successResponse(newPass, 'Pass created successfully');
      } catch (error) {
        set.status = 400;
        return errorResponse(
          error instanceof Error ? error.message : 'Failed to create pass'
        );
      }
    },
    {
      body: t.Object({
        garageId: t.String({ format: 'uuid' }),
        name: t.String({ minLength: 1, maxLength: 255 }),
        description: t.Optional(t.String({ maxLength: 1000 })),
        stripeProductId: t.Optional(t.String({ maxLength: 255 })),
        stripePriceId: t.Optional(t.String({ maxLength: 255 })),
        monthlyAmount: t.Number({ minimum: 0 }),
        active: t.Optional(t.Boolean()),
      }),
      detail: {
        tags: ['passes'],
        summary: 'Create pass',
        description: 'Creates a new parking pass',
      },
    }
  )
  // Update pass (with price change handling)
  .put(
    '/:id',
    async ({ params: { id }, body, set }) => {
      try {
        // Check if price is being updated
        if (body.monthlyAmount !== undefined) {
          // Use price management service for price changes
          const result = await updatePassPrice({
            passId: id,
            newPrice: body.monthlyAmount,
            ...(body.changedBy && { changedBy: body.changedBy }),
            ...(body.changeReason && { changeReason: body.changeReason }),
          });

          if (!result.success) {
            set.status = 400;
            return errorResponse(result.error.message);
          }

          // If there are other fields to update, update them separately
          const { monthlyAmount, changedBy, changeReason, ...otherFields } = body;
          if (Object.keys(otherFields).length > 0) {
            await db
              .update(passes)
              .set(otherFields as any)
              .where(eq(passes.id, id));
          }

          const message = result.data.subscriptionsMigrated
            ? `Pass updated with price change. ${result.data.subscriptionsMigrated.successful} subscriptions migrated to new price.`
            : 'Pass updated successfully with price change tracked';

          return successResponse(
            {
              pass: result.data.pass,
              priceChange: {
                oldPrice: result.data.oldPrice,
                newPrice: result.data.newPrice,
                stripePriceId: result.data.newStripePriceId,
              },
              ...(result.data.subscriptionsMigrated && {
                subscriptionsMigrated: result.data.subscriptionsMigrated,
              }),
            },
            message
          );
        } else {
          // No price change, just update other fields
          const [updatedPass] = await db
            .update(passes)
            .set(body as any)
            .where(eq(passes.id, id))
            .returning();

          if (!updatedPass) {
            set.status = 404;
            return errorResponse('Pass not found');
          }

          return successResponse(updatedPass, 'Pass updated successfully');
        }
      } catch (error) {
        set.status = 400;
        return errorResponse(
          error instanceof Error ? error.message : 'Failed to update pass'
        );
      }
    },
    {
      params: t.Object({
        id: t.String({ format: 'uuid' }),
      }),
      body: t.Object({
        garageId: t.Optional(t.String({ format: 'uuid' })),
        name: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
        description: t.Optional(t.String({ maxLength: 1000 })),
        stripeProductId: t.Optional(t.String({ maxLength: 255 })),
        stripePriceId: t.Optional(t.String({ maxLength: 255 })),
        monthlyAmount: t.Optional(t.Number({ minimum: 0 })),
        active: t.Optional(t.Boolean()),
        changedBy: t.Optional(t.String({ maxLength: 255 })),
        changeReason: t.Optional(t.String({ maxLength: 1000 })),
      }),
      detail: {
        tags: ['passes'],
        summary: 'Update pass',
        description:
          'Updates an existing parking pass. If price changes, creates new Stripe price and tracks history.',
      },
    }
  )
  // Get price history for a pass
  .get(
    '/:id/price-history',
    async ({ params: { id }, set }) => {
      const result = await getPassPriceHistory(id);

      if (!result.success) {
        set.status = 500;
        return errorResponse(result.error.message);
      }

      return successResponse(result.data, 'Price history retrieved');
    },
    {
      params: t.Object({
        id: t.String({ format: 'uuid' }),
      }),
      detail: {
        tags: ['passes'],
        summary: 'Get pass price history',
        description:
          'Returns the complete price change history for a specific pass',
      },
    }
  )
  // Preview price migration (dry run)
  .get(
    '/:id/migration-preview',
    async ({ params: { id }, set }) => {
      const result = await previewPriceMigration(id);

      if (!result.success) {
        set.status = 500;
        return errorResponse(result.error.message);
      }

      return successResponse(
        result.data,
        'Price migration preview generated'
      );
    },
    {
      params: t.Object({
        id: t.String({ format: 'uuid' }),
      }),
      detail: {
        tags: ['passes'],
        summary: 'Preview price migration',
        description:
          'Shows what would happen if all subscriptions were migrated to current price (dry run)',
      },
    }
  )
  // Migrate all subscriptions to current price
  .post(
    '/:id/migrate-subscriptions',
    async ({ params: { id }, set }) => {
      const result = await migrateAllSubscriptionsForPass(id);

      if (!result.success) {
        set.status = 500;
        return errorResponse(result.error.message);
      }

      const migrated = result.data.filter((r) => r.status === 'migrated')
        .length;
      const skipped = result.data.filter((r) => r.status === 'skipped').length;
      const failed = result.data.filter((r) => r.status === 'failed').length;

      return successResponse(
        {
          summary: {
            total: result.data.length,
            migrated,
            skipped,
            failed,
          },
          details: result.data,
        },
        `Migration complete: ${migrated} migrated, ${skipped} skipped, ${failed} failed`
      );
    },
    {
      params: t.Object({
        id: t.String({ format: 'uuid' }),
      }),
      detail: {
        tags: ['passes'],
        summary: 'Migrate subscriptions to current price',
        description:
          'Updates all active subscriptions for this pass to use the current price. Creates prorated charges in Stripe.',
      },
    }
  );

