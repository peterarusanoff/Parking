import { eq } from 'drizzle-orm';

import { db, subscriptions } from '@/database/index';
import type { Result } from '@/shared/index';

import { stripe } from './stripe-client';

export interface CancellationResult {
  subscriptionId: string;
  userId: string;
  status: 'cancelled' | 'scheduled_for_cancellation';
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd?: Date;
  message: string;
}

/**
 * Cancel a subscription at the end of the current billing period
 * User keeps access until current_period_end
 */
export async function cancelSubscription(
  subscriptionId: string
): Promise<Result<CancellationResult>> {
  try {
    // Get the subscription from our database
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, subscriptionId))
      .limit(1);

    if (!subscription) {
      return {
        success: false,
        error: new Error('Subscription not found'),
      };
    }

    // Check if already cancelled
    if (subscription.status === 'canceled') {
      return {
        success: false,
        error: new Error('Subscription is already cancelled'),
      };
    }

    // Check if already scheduled for cancellation
    if (subscription.cancelAtPeriodEnd) {
      return {
        success: true,
        data: {
          subscriptionId: subscription.id,
          userId: subscription.userId,
          status: 'scheduled_for_cancellation',
          cancelAtPeriodEnd: true,
          ...(subscription.currentPeriodEnd && {
            currentPeriodEnd: subscription.currentPeriodEnd,
          }),
          message: 'Subscription is already scheduled for cancellation',
        },
      };
    }

    // Cancel in Stripe if we have a Stripe subscription ID
    if (subscription.stripeSubscriptionId) {
      // Update Stripe to cancel at period end
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
    }

    // Update our database
    await db
      .update(subscriptions)
      .set({
        cancelAtPeriodEnd: true,
        updatedAt: new Date(),
      } as any)
      .where(eq(subscriptions.id, subscriptionId));

    const message = subscription.currentPeriodEnd
      ? `Subscription will be cancelled on ${subscription.currentPeriodEnd.toLocaleDateString()}. You will retain access until then.`
      : 'Subscription scheduled for cancellation at the end of current period.';

    return {
      success: true,
      data: {
        subscriptionId: subscription.id,
        userId: subscription.userId,
        status: 'scheduled_for_cancellation',
        cancelAtPeriodEnd: true,
        ...(subscription.currentPeriodEnd && {
          currentPeriodEnd: subscription.currentPeriodEnd,
        }),
        message,
      },
    };
  } catch (error) {
    console.error(`Failed to cancel subscription ${subscriptionId}:`, error);
    return {
      success: false,
      error: new Error(
        error instanceof Error
          ? error.message
          : 'Failed to cancel subscription'
      ),
    };
  }
}

/**
 * Reactivate a subscription that was scheduled for cancellation
 * Only works if the subscription hasn't ended yet
 */
export async function reactivateSubscription(
  subscriptionId: string
): Promise<Result<CancellationResult>> {
  try {
    // Get the subscription from our database
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, subscriptionId))
      .limit(1);

    if (!subscription) {
      return {
        success: false,
        error: new Error('Subscription not found'),
      };
    }

    // Check if subscription is active
    if (subscription.status === 'canceled') {
      return {
        success: false,
        error: new Error(
          'Subscription has already been cancelled and cannot be reactivated'
        ),
      };
    }

    // Check if subscription was scheduled for cancellation
    if (!subscription.cancelAtPeriodEnd) {
      return {
        success: false,
        error: new Error('Subscription is not scheduled for cancellation'),
      };
    }

    // Reactivate in Stripe if we have a Stripe subscription ID
    if (subscription.stripeSubscriptionId) {
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: false,
      });
    }

    // Update our database
    await db
      .update(subscriptions)
      .set({
        cancelAtPeriodEnd: false,
        updatedAt: new Date(),
      } as any)
      .where(eq(subscriptions.id, subscriptionId));

    return {
      success: true,
      data: {
        subscriptionId: subscription.id,
        userId: subscription.userId,
        status: 'cancelled',
        cancelAtPeriodEnd: false,
        ...(subscription.currentPeriodEnd && {
          currentPeriodEnd: subscription.currentPeriodEnd,
        }),
        message: 'Subscription reactivated successfully. It will continue to renew.',
      },
    };
  } catch (error) {
    console.error(
      `Failed to reactivate subscription ${subscriptionId}:`,
      error
    );
    return {
      success: false,
      error: new Error(
        error instanceof Error
          ? error.message
          : 'Failed to reactivate subscription'
      ),
    };
  }
}

/**
 * Immediately cancel a subscription (no grace period)
 * User loses access immediately
 */
export async function cancelSubscriptionImmediately(
  subscriptionId: string
): Promise<Result<CancellationResult>> {
  try {
    // Get the subscription from our database
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, subscriptionId))
      .limit(1);

    if (!subscription) {
      return {
        success: false,
        error: new Error('Subscription not found'),
      };
    }

    // Check if already cancelled
    if (subscription.status === 'canceled') {
      return {
        success: false,
        error: new Error('Subscription is already cancelled'),
      };
    }

    // Cancel immediately in Stripe if we have a Stripe subscription ID
    if (subscription.stripeSubscriptionId) {
      await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
    }

    // Update our database
    await db
      .update(subscriptions)
      .set({
        status: 'canceled',
        cancelAtPeriodEnd: false,
        canceledAt: new Date(),
        updatedAt: new Date(),
      } as any)
      .where(eq(subscriptions.id, subscriptionId));

    return {
      success: true,
      data: {
        subscriptionId: subscription.id,
        userId: subscription.userId,
        status: 'cancelled',
        cancelAtPeriodEnd: false,
        message: 'Subscription cancelled immediately. Access has been revoked.',
      },
    };
  } catch (error) {
    console.error(
      `Failed to immediately cancel subscription ${subscriptionId}:`,
      error
    );
    return {
      success: false,
      error: new Error(
        error instanceof Error
          ? error.message
          : 'Failed to immediately cancel subscription'
      ),
    };
  }
}

