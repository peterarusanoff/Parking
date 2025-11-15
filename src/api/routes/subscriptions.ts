import { Elysia, t } from 'elysia';

import {
  cancelSubscription,
  cancelSubscriptionImmediately,
  reactivateSubscription,
} from '@/billing/subscription-cancellation';
import {
  processSubscriptionRenewals,
  renewSubscription,
} from '@/billing/subscription-renewal';
import { db, subscriptions } from '@/database/index';
import { errorResponse, successResponse } from '@/shared/index';
import { eq } from 'drizzle-orm';

export const subscriptionRoutes = new Elysia({ prefix: '/api/subscriptions' })
  // Get all subscriptions
  .get(
    '/',
    async () => {
      const allSubscriptions = await db.select().from(subscriptions);
      return successResponse(allSubscriptions);
    },
    {
      detail: {
        tags: ['subscriptions'],
        summary: 'Get all subscriptions',
        description: 'Returns a list of all subscriptions',
      },
    }
  )
  // Get subscription by ID
  .get(
    '/:id',
    async ({ params: { id }, set }) => {
      const [subscription] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, id))
        .limit(1);

      if (!subscription) {
        set.status = 404;
        return errorResponse('Subscription not found');
      }

      return successResponse(subscription);
    },
    {
      params: t.Object({
        id: t.String({ format: 'uuid' }),
      }),
      detail: {
        tags: ['subscriptions'],
        summary: 'Get subscription by ID',
        description: 'Returns a single subscription by its ID',
      },
    }
  )
  // Create subscription
  .post(
    '/',
    async ({ body, set }) => {
      try {
        const insertData: Record<string, unknown> = { ...body };
        // Convert date strings to Date objects
        if (body.currentPeriodStart) {
          insertData['currentPeriodStart'] = new Date(
            body.currentPeriodStart
          );
        }
        if (body.currentPeriodEnd) {
          insertData['currentPeriodEnd'] = new Date(body.currentPeriodEnd);
        }
        if (body.canceledAt) {
          insertData['canceledAt'] = new Date(body.canceledAt);
        }
        const [newSubscription] = await db
          .insert(subscriptions)
          .values(insertData as any)
          .returning();
        set.status = 201;
        return successResponse(
          newSubscription,
          'Subscription created successfully'
        );
      } catch (error) {
        set.status = 400;
        return errorResponse(
          error instanceof Error
            ? error.message
            : 'Failed to create subscription'
        );
      }
    },
    {
      body: t.Object({
        userId: t.String({ format: 'uuid' }),
        garageId: t.String({ format: 'uuid' }),
        passId: t.String({ format: 'uuid' }),
        stripeSubscriptionId: t.Optional(t.String({ maxLength: 255 })),
        stripePriceId: t.Optional(t.String({ maxLength: 255 })),
        status: t.Union([
          t.Literal('active'),
          t.Literal('past_due'),
          t.Literal('canceled'),
          t.Literal('unpaid'),
          t.Literal('trialing'),
        ]),
        currentPeriodStart: t.Optional(t.String({ format: 'date-time' })),
        currentPeriodEnd: t.Optional(t.String({ format: 'date-time' })),
        cancelAtPeriodEnd: t.Optional(t.Boolean()),
        canceledAt: t.Optional(t.String({ format: 'date-time' })),
        monthlyAmount: t.Integer({ minimum: 0 }),
      }),
      detail: {
        tags: ['subscriptions'],
        summary: 'Create subscription',
        description: 'Creates a new subscription',
      },
    }
  )
  // Update subscription
  .put(
    '/:id',
    async ({ params: { id }, body, set }) => {
      try {
        const updateData: Record<string, unknown> = { ...body };
        if (body.monthlyAmount !== undefined) {
          updateData['monthlyAmount'] = body.monthlyAmount;
        }
        if (body.currentPeriodStart) {
          updateData['currentPeriodStart'] = new Date(
            body.currentPeriodStart
          );
        }
        if (body.currentPeriodEnd) {
          updateData['currentPeriodEnd'] = new Date(body.currentPeriodEnd);
        }
        if (body.canceledAt) {
          updateData['canceledAt'] = new Date(body.canceledAt);
        }
        const [updatedSubscription] = await db
          .update(subscriptions)
          .set(updateData as any)
          .where(eq(subscriptions.id, id))
          .returning();

        if (!updatedSubscription) {
          set.status = 404;
          return errorResponse('Subscription not found');
        }

        return successResponse(
          updatedSubscription,
          'Subscription updated successfully'
        );
      } catch (error) {
        set.status = 400;
        return errorResponse(
          error instanceof Error
            ? error.message
            : 'Failed to update subscription'
        );
      }
    },
    {
      params: t.Object({
        id: t.String({ format: 'uuid' }),
      }),
      body: t.Object({
        userId: t.Optional(t.String({ format: 'uuid' })),
        garageId: t.Optional(t.String({ format: 'uuid' })),
        passId: t.Optional(t.String({ format: 'uuid' })),
        stripeSubscriptionId: t.Optional(t.String({ maxLength: 255 })),
        stripePriceId: t.Optional(t.String({ maxLength: 255 })),
        status: t.Optional(
          t.Union([
            t.Literal('active'),
            t.Literal('past_due'),
            t.Literal('canceled'),
            t.Literal('unpaid'),
            t.Literal('trialing'),
          ])
        ),
        currentPeriodStart: t.Optional(t.String({ format: 'date-time' })),
        currentPeriodEnd: t.Optional(t.String({ format: 'date-time' })),
        cancelAtPeriodEnd: t.Optional(t.Boolean()),
        canceledAt: t.Optional(t.String({ format: 'date-time' })),
        monthlyAmount: t.Optional(t.Integer({ minimum: 0 })),
      }),
      detail: {
        tags: ['subscriptions'],
        summary: 'Update subscription',
        description: 'Updates an existing subscription',
      },
    }
  )
  // Renew specific subscription
  .post(
    '/:id/renew',
    async ({ params: { id }, set }) => {
      const result = await renewSubscription(id);

      if (!result.success) {
        set.status = 400;
        return errorResponse(result.error.message);
      }

      return successResponse(
        result.data,
        'Subscription renewed successfully'
      );
    },
    {
      params: t.Object({
        id: t.String({ format: 'uuid' }),
      }),
      detail: {
        tags: ['subscriptions'],
        summary: 'Renew subscription',
        description: 'Manually renew a subscription by syncing with Stripe',
      },
    }
  )
  // Process all expiring subscriptions
  .post(
    '/process-renewals',
    async ({ query, set }) => {
      const daysAhead = query.daysAhead ? parseInt(query.daysAhead) : 7;
      const result = await processSubscriptionRenewals(daysAhead);

      if (!result.success) {
        set.status = 500;
        return errorResponse(result.error.message);
      }

      return successResponse(
        {
          processed: result.data.length,
          results: result.data,
        },
        `Processed ${result.data.length} subscription renewals`
      );
    },
    {
      query: t.Object({
        daysAhead: t.Optional(t.String()),
      }),
      detail: {
        tags: ['subscriptions'],
        summary: 'Process subscription renewals',
        description:
          'Process all subscriptions expiring within specified days (default: 7)',
      },
    }
  )
  // Cancel subscription at period end
  .post(
    '/:id/cancel',
    async ({ params: { id }, set }) => {
      const result = await cancelSubscription(id);

      if (!result.success) {
        set.status =
          result.error.message === 'Subscription not found' ? 404 : 400;
        return errorResponse(result.error.message);
      }

      return successResponse(result.data, result.data.message);
    },
    {
      params: t.Object({
        id: t.String({ format: 'uuid' }),
      }),
      detail: {
        tags: ['subscriptions'],
        summary: 'Cancel subscription at period end',
        description:
          'Schedules a subscription for cancellation at the end of the current billing period. User retains access until then.',
      },
    }
  )
  // Reactivate subscription
  .post(
    '/:id/reactivate',
    async ({ params: { id }, set }) => {
      const result = await reactivateSubscription(id);

      if (!result.success) {
        set.status =
          result.error.message === 'Subscription not found' ? 404 : 400;
        return errorResponse(result.error.message);
      }

      return successResponse(result.data, result.data.message);
    },
    {
      params: t.Object({
        id: t.String({ format: 'uuid' }),
      }),
      detail: {
        tags: ['subscriptions'],
        summary: 'Reactivate subscription',
        description:
          'Reactivates a subscription that was scheduled for cancellation. Only works before the period ends.',
      },
    }
  )
  // Cancel subscription immediately (admin only)
  .post(
    '/:id/cancel-immediately',
    async ({ params: { id }, set }) => {
      const result = await cancelSubscriptionImmediately(id);

      if (!result.success) {
        set.status =
          result.error.message === 'Subscription not found' ? 404 : 400;
        return errorResponse(result.error.message);
      }

      return successResponse(result.data, result.data.message);
    },
    {
      params: t.Object({
        id: t.String({ format: 'uuid' }),
      }),
      detail: {
        tags: ['subscriptions'],
        summary: 'Cancel subscription immediately',
        description:
          'Immediately cancels a subscription. User loses access right away. This is typically an admin action.',
      },
    }
  );

