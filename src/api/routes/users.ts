import { Elysia, t } from 'elysia';

import { createUser, updateUser } from '@/billing/user-management';
import { db, garages, passes, subscriptions, users } from '@/database/index';
import { errorResponse, successResponse } from '@/shared/index';
import { eq } from 'drizzle-orm';

export const userRoutes = new Elysia({ prefix: '/api/users' })
  // Get all users
  .get(
    '/',
    async () => {
      const allUsers = await db.select().from(users);
      return successResponse(allUsers);
    },
    {
      detail: {
        tags: ['users'],
        summary: 'Get all users',
        description: 'Returns a list of all users',
      },
    }
  )
  // Get user by ID with subscriptions
  .get(
    '/:id',
    async ({ params: { id }, set }) => {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (!user) {
        set.status = 404;
        return errorResponse('User not found');
      }

      // Get all subscriptions with pass details for this user
      const userSubscriptions = await db
        .select({
          subscription: subscriptions,
          pass: passes,
          garage: garages,
        })
        .from(subscriptions)
        .innerJoin(passes, eq(subscriptions.passId, passes.id))
        .innerJoin(garages, eq(subscriptions.garageId, garages.id))
        .where(eq(subscriptions.userId, id));

      // Format the response
      const userWithSubscriptions = {
        ...user,
        subscriptions: userSubscriptions.map((sub) => ({
          subscriptionId: sub.subscription.id,
          status: sub.subscription.status,
          currentPeriodStart: sub.subscription.currentPeriodStart,
          currentPeriodEnd: sub.subscription.currentPeriodEnd,
          cancelAtPeriodEnd: sub.subscription.cancelAtPeriodEnd,
          monthlyAmount: sub.subscription.monthlyAmount,
          pass: {
            id: sub.pass.id,
            name: sub.pass.name,
            description: sub.pass.description,
            monthlyAmount: sub.pass.monthlyAmount,
            active: sub.pass.active,
          },
          garage: {
            id: sub.garage.id,
            name: sub.garage.name,
            address: sub.garage.address,
          },
        })),
      };

      return successResponse(userWithSubscriptions);
    },
    {
      params: t.Object({
        id: t.String({ format: 'uuid' }),
      }),
      detail: {
        tags: ['users'],
        summary: 'Get user by ID with subscriptions',
        description:
          'Returns a single user with all their active passes and subscription details',
      },
    }
  )
  // Create user with Stripe customer
  .post(
    '/',
    async ({ body, set }) => {
      const result = await createUser(body);

      if (!result.success) {
        set.status = 400;
        return errorResponse(result.error.message);
      }

      set.status = 201;
      return successResponse(
        result.data,
        'User created successfully with Stripe customer'
      );
    },
    {
      body: t.Object({
        firstName: t.String({ minLength: 1, maxLength: 255 }),
        lastName: t.String({ minLength: 1, maxLength: 255 }),
        email: t.String({ format: 'email', maxLength: 255 }),
        phone: t.Optional(t.String({ maxLength: 50 })),
      }),
      detail: {
        tags: ['users'],
        summary: 'Create user with Stripe customer',
        description:
          'Creates a new user and automatically creates a Stripe customer',
      },
    }
  )
  // Update user and sync with Stripe
  .put(
    '/:id',
    async ({ params: { id }, body, set }) => {
      const result = await updateUser(id, body);

      if (!result.success) {
        set.status = result.error.message === 'User not found' ? 404 : 400;
        return errorResponse(result.error.message);
      }

      return successResponse(
        result.data,
        'User updated successfully (Stripe synced)'
      );
    },
    {
      params: t.Object({
        id: t.String({ format: 'uuid' }),
      }),
      body: t.Object({
        firstName: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
        lastName: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
        email: t.Optional(t.String({ format: 'email', maxLength: 255 })),
        phone: t.Optional(t.String({ maxLength: 50 })),
      }),
      detail: {
        tags: ['users'],
        summary: 'Update user and sync with Stripe',
        description:
          'Updates an existing user and syncs changes with Stripe customer',
      },
    }
  );
