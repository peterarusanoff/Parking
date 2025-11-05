import { eq, sql } from 'drizzle-orm';

import { db, subscriptions } from '@/database/index';
import type { Result } from '@/shared/index';

import { stripe } from './stripe-client';

export interface RenewalResult {
  subscriptionId: string;
  userId: string;
  status: 'renewed' | 'failed' | 'cancelled';
  newPeriodEnd?: Date;
  error?: string;
}

/**
 * Process subscription renewals
 * This syncs with Stripe to ensure our database reflects the current subscription state
 */
export async function processSubscriptionRenewals(
  daysAhead = 7
): Promise<Result<RenewalResult[]>> {
  try {
    const results: RenewalResult[] = [];

    // Find subscriptions that need renewal using our database function
    const expiringSubscriptions = await db.execute<{
      subscription_id: string;
      user_id: string;
      pass_id: string;
      garage_id: string;
      stripe_subscription_id: string;
      days_until_expiry: number;
    }>(sql`
      SELECT * FROM find_expiring_subscriptions(${daysAhead})
    `);

    const rows = Array.from(expiringSubscriptions);

    console.log(
      `Found ${rows.length} subscriptions expiring within ${daysAhead} days`
    );

    for (const row of rows) {
      const subscriptionId = row.subscription_id as string;
      const userId = row.user_id as string;
      const stripeSubscriptionId = row.stripe_subscription_id as string;

      try {
        // Mark as processing
        await db
          .update(subscriptions)
          .set({
            renewalStatus: 'processing',
            renewalAttemptedAt: new Date(),
          } as any)
          .where(eq(subscriptions.id, subscriptionId));

        if (!stripeSubscriptionId) {
          // No Stripe subscription, mark as failed
          await db
            .update(subscriptions)
            .set({ renewalStatus: 'failed' } as any)
            .where(eq(subscriptions.id, subscriptionId));

          results.push({
            subscriptionId,
            userId,
            status: 'failed',
            error: 'No Stripe subscription ID',
          });
          continue;
        }

        // Fetch the latest subscription data from Stripe
        const stripeSubscription =
          await stripe.subscriptions.retrieve(stripeSubscriptionId);

        // Check if subscription is still active in Stripe
        if (stripeSubscription.status === 'canceled') {
          await db
            .update(subscriptions)
            .set({
              status: 'canceled',
              renewalStatus: 'completed',
              canceledAt: new Date(stripeSubscription.canceled_at! * 1000),
            } as any)
            .where(eq(subscriptions.id, subscriptionId));

          results.push({
            subscriptionId,
            userId,
            status: 'cancelled',
          });
          continue;
        }

        // Stripe automatically renews subscriptions
        // We just need to sync the new period dates
        const newPeriodEnd = new Date(
          stripeSubscription.current_period_end * 1000
        );
        const newPeriodStart = new Date(
          stripeSubscription.current_period_start * 1000
        );

        await db
          .update(subscriptions)
          .set({
            status: stripeSubscription.status as any,
            currentPeriodStart: newPeriodStart,
            currentPeriodEnd: newPeriodEnd,
            renewalStatus: 'completed',
            nextRenewalDate: newPeriodEnd,
          } as any)
          .where(eq(subscriptions.id, subscriptionId));

        results.push({
          subscriptionId,
          userId,
          status: 'renewed',
          newPeriodEnd,
        });

        console.log(
          `✓ Renewed subscription ${subscriptionId} until ${newPeriodEnd.toISOString()}`
        );
      } catch (error) {
        console.error(
          `✗ Failed to renew subscription ${subscriptionId}:`,
          error
        );

        await db
          .update(subscriptions)
          .set({ renewalStatus: 'failed' } as any)
          .where(eq(subscriptions.id, subscriptionId));

        results.push({
          subscriptionId,
          userId,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return {
      success: true,
      data: results,
    };
  } catch (error) {
    console.error('Error processing renewals:', error);
    return {
      success: false,
      error: new Error(
        error instanceof Error
          ? error.message
          : 'Failed to process renewals'
      ),
    };
  }
}

/**
 * Manually renew a specific subscription
 */
export async function renewSubscription(
  subscriptionId: string
): Promise<Result<RenewalResult>> {
  try {
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

    if (!subscription.stripeSubscriptionId) {
      return {
        success: false,
        error: new Error('No Stripe subscription ID'),
      };
    }

    // Get latest from Stripe
    const stripeSubscription = await stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId
    );

    // Update our database
    const newPeriodEnd = new Date(
      stripeSubscription.current_period_end * 1000
    );
    const newPeriodStart = new Date(
      stripeSubscription.current_period_start * 1000
    );

    await db
      .update(subscriptions)
      .set({
        status: stripeSubscription.status as any,
        currentPeriodStart: newPeriodStart,
        currentPeriodEnd: newPeriodEnd,
        renewalStatus: 'completed',
        nextRenewalDate: newPeriodEnd,
        renewalAttemptedAt: new Date(),
      } as any)
      .where(eq(subscriptions.id, subscriptionId));

    return {
      success: true,
      data: {
        subscriptionId,
        userId: subscription.userId,
        status: 'renewed',
        newPeriodEnd,
      },
    };
  } catch (error) {
    console.error(`Failed to renew subscription ${subscriptionId}:`, error);
    return {
      success: false,
      error: new Error(
        error instanceof Error ? error.message : 'Failed to renew subscription'
      ),
    };
  }
}

