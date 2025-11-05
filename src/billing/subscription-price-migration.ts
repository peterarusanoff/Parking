import { eq } from 'drizzle-orm';

import { db, passes, subscriptions } from '@/database/index';
import type { Result } from '@/shared/index';

import { stripe } from './stripe-client';

export interface MigrationResult {
  subscriptionId: string;
  userId: string;
  oldPrice: string;
  newPrice: string;
  oldStripePriceId: string;
  newStripePriceId: string;
  status: 'migrated' | 'failed' | 'skipped';
  reason?: string;
}

/**
 * Migrate a single subscription to the pass's current price
 * This updates the subscription in both Stripe and our database
 */
export async function migrateSubscriptionToCurrentPrice(
  subscriptionId: string
): Promise<Result<MigrationResult>> {
  try {
    // 1. Get the subscription
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

    // 2. Get the pass's current price
    const [pass] = await db
      .select()
      .from(passes)
      .where(eq(passes.id, subscription.passId))
      .limit(1);

    if (!pass) {
      return {
        success: false,
        error: new Error('Pass not found'),
      };
    }

    // 3. Check if migration is needed
    if (subscription.stripePriceId === pass.stripePriceId) {
      return {
        success: true,
        data: {
          subscriptionId: subscription.id,
          userId: subscription.userId,
          oldPrice: subscription.monthlyAmount,
          newPrice: pass.monthlyAmount,
          oldStripePriceId: subscription.stripePriceId || '',
          newStripePriceId: pass.stripePriceId || '',
          status: 'skipped',
          reason: 'Subscription already on current price',
        },
      };
    }

    // 4. Update in Stripe
    if (subscription.stripeSubscriptionId && pass.stripePriceId) {
      const stripeSubscription = await stripe.subscriptions.retrieve(
        subscription.stripeSubscriptionId
      );

      // Get the subscription item ID
      const subscriptionItemId = stripeSubscription.items.data[0]?.id;

      if (!subscriptionItemId) {
        return {
          success: false,
          error: new Error('No subscription item found in Stripe'),
        };
      }

      // Update the subscription to use the new price
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        items: [
          {
            id: subscriptionItemId,
            price: pass.stripePriceId,
          },
        ],
        proration_behavior: 'create_prorations', // Create prorated charges
      });
    }

    // 5. Update in our database
    const oldPrice = subscription.monthlyAmount;
    const newPrice = pass.monthlyAmount;
    const oldStripePriceId = subscription.stripePriceId || '';

    await db
      .update(subscriptions)
      .set({
        stripePriceId: pass.stripePriceId,
        monthlyAmount: pass.monthlyAmount,
        updatedAt: new Date(),
      } as any)
      .where(eq(subscriptions.id, subscriptionId));

    console.log(
      `✓ Migrated subscription ${subscriptionId}: $${oldPrice} → $${newPrice}`
    );

    return {
      success: true,
      data: {
        subscriptionId: subscription.id,
        userId: subscription.userId,
        oldPrice,
        newPrice,
        oldStripePriceId,
        newStripePriceId: pass.stripePriceId || '',
        status: 'migrated',
      },
    };
  } catch (error) {
    console.error('Error migrating subscription price:', error);
    return {
      success: false,
      error: new Error(
        error instanceof Error
          ? error.message
          : 'Failed to migrate subscription price'
      ),
    };
  }
}

/**
 * Migrate all active subscriptions for a pass to the current price
 */
export async function migrateAllSubscriptionsForPass(
  passId: string
): Promise<Result<MigrationResult[]>> {
  try {
    // Get all active subscriptions for this pass
    const activeSubscriptions = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.passId, passId));

    const results: MigrationResult[] = [];

    for (const subscription of activeSubscriptions) {
      const result = await migrateSubscriptionToCurrentPrice(subscription.id);

      if (result.success) {
        results.push(result.data);
      } else {
        results.push({
          subscriptionId: subscription.id,
          userId: subscription.userId,
          oldPrice: subscription.monthlyAmount,
          newPrice: subscription.monthlyAmount,
          oldStripePriceId: subscription.stripePriceId || '',
          newStripePriceId: subscription.stripePriceId || '',
          status: 'failed',
          reason: result.error.message,
        });
      }
    }

    return {
      success: true,
      data: results,
    };
  } catch (error) {
    console.error('Error migrating subscriptions:', error);
    return {
      success: false,
      error: new Error(
        error instanceof Error
          ? error.message
          : 'Failed to migrate subscriptions'
      ),
    };
  }
}

/**
 * Preview what would change if we migrated subscriptions
 * (Dry run - doesn't actually make changes)
 */
export async function previewPriceMigration(passId: string): Promise<
  Result<
    Array<{
      subscriptionId: string;
      userId: string;
      currentPrice: string;
      newPrice: string;
      priceDifference: string;
      willMigrate: boolean;
    }>
  >
> {
  try {
    // Get the pass's current price
    const [pass] = await db
      .select()
      .from(passes)
      .where(eq(passes.id, passId))
      .limit(1);

    if (!pass) {
      return {
        success: false,
        error: new Error('Pass not found'),
      };
    }

    // Get all active subscriptions
    const activeSubscriptions = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.passId, passId));

    const preview = activeSubscriptions.map((sub) => {
      const currentPrice = parseFloat(sub.monthlyAmount);
      const newPrice = parseFloat(pass.monthlyAmount);
      const difference = newPrice - currentPrice;

      return {
        subscriptionId: sub.id,
        userId: sub.userId,
        currentPrice: sub.monthlyAmount,
        newPrice: pass.monthlyAmount,
        priceDifference: difference.toFixed(2),
        willMigrate: sub.stripePriceId !== pass.stripePriceId,
      };
    });

    return {
      success: true,
      data: preview,
    };
  } catch (error) {
    console.error('Error previewing migration:', error);
    return {
      success: false,
      error: new Error(
        error instanceof Error ? error.message : 'Failed to preview migration'
      ),
    };
  }
}

