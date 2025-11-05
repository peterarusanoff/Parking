import { Elysia, t } from 'elysia';

import {
  createGaragePass,
  generateRevenueReport,
  subscribeUserToPass,
} from '@/billing/billing';
import { errorResponse, successResponse } from '@/shared/index';

export const billingRoutes = new Elysia({ prefix: '/api/billing' })
  // Create garage pass with Stripe
  .post(
    '/pass',
    async ({ body, set }) => {
      const result = await createGaragePass(body);

      if (!result.success) {
        set.status = 400;
        return errorResponse(result.error.message);
      }

      set.status = 201;
      return successResponse(result.data, 'Garage pass created successfully');
    },
    {
      body: t.Object({
        passId: t.String({ format: 'uuid' }),
        garageId: t.String({ format: 'uuid' }),
        name: t.String({ minLength: 1, maxLength: 255 }),
        description: t.String({ maxLength: 1000 }),
        monthlyPrice: t.Number({ minimum: 0.01 }),
      }),
      detail: {
        tags: ['billing'],
        summary: 'Create a garage pass',
        description: 'Creates a new garage pass with Stripe product and price',
      },
    }
  )
  // Subscribe user to pass
  .post(
    '/subscribe',
    async ({ body, set }) => {
      const result = await subscribeUserToPass(body);

      if (!result.success) {
        set.status = 400;
        return errorResponse(result.error.message);
      }

      set.status = 201;
      return successResponse(result.data, 'User subscribed successfully');
    },
    {
      body: t.Object({
        userId: t.String({ format: 'uuid' }),
        passId: t.String({ format: 'uuid' }),
      }),
      detail: {
        tags: ['billing'],
        summary: 'Subscribe user to pass',
        description:
          'Creates a subscription for a user to a specific garage pass',
      },
    }
  )
  // Generate revenue report
  .get(
    '/report',
    async ({ set }) => {
      const result = await generateRevenueReport();

      if (!result.success) {
        set.status = 500;
        return errorResponse(result.error.message);
      }

      return successResponse(result.data, 'Revenue report generated');
    },
    {
      detail: {
        tags: ['billing'],
        summary: 'Generate revenue report',
        description:
          'Returns revenue report aggregated by garage with active subscriptions',
      },
    }
  );
