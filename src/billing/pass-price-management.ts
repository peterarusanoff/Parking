import { eq } from 'drizzle-orm';

import { db, passes, passPriceHistory, subscriptions } from '@/database/index';
import type { Pass } from '@/database/schema';
import type { Result } from '@/shared/index';

import { stripe } from './stripe-client';

export interface UpdatePassPriceParams {
  passId: string;
  newPrice: number;
  changedBy?: string;
  changeReason?: string;
  effectiveDate?: Date;
  skipSubscriptionMigration?: boolean; // Optional: skip migrating existing subscriptions
}

export interface PriceUpdateResult {
  pass: Pass;
  priceHistory: {
    id: string;
    passId: string;
    oldPrice: string | null;
    newPrice: string;
    oldStripePriceId: string | null;
    newStripePriceId: string | null;
    changedBy: string | null;
    changeReason: string | null;
    effectiveDate: Date;
    createdAt: Date;
  };
  oldPrice: string;
  newPrice: string;
  newStripePriceId?: string;
  subscriptionsMigrated?: {
    total: number;
    successful: number;
    failed: number;
    details: Array<{
      subscriptionId: string;
      userId: string;
      status: 'migrated' | 'failed';
      error?: string;
    }>;
  };
}

/**
 * Update pass price with Stripe synchronization and history tracking
 */
export async function updatePassPrice(
  params: UpdatePassPriceParams
): Promise<Result<PriceUpdateResult>> {
  try {
    // 1. Get the current pass
    const [currentPass] = await db
      .select()
      .from(passes)
      .where(eq(passes.id, params.passId))
      .limit(1);

    if (!currentPass) {
      return {
        success: false,
        error: new Error('Pass not found'),
      };
    }

    const oldPrice = currentPass.monthlyAmount;
    const newPrice = params.newPrice.toFixed(2);

    // Check if price actually changed
    if (parseFloat(oldPrice) === params.newPrice) {
      return {
        success: false,
        error: new Error('New price is the same as current price'),
      };
    }

    let newStripePriceId: string | undefined;

    // 2. Create new Stripe price if we have a Stripe product
    if (currentPass.stripeProductId) {
      try {
        const stripePrice = await stripe.prices.create({
          product: currentPass.stripeProductId,
          currency: 'usd',
          unit_amount: Math.round(params.newPrice * 100), // Convert to cents
          recurring: {
            interval: 'month',
          },
          metadata: {
            passId: currentPass.id,
            previousPrice: oldPrice,
            priceChangeDate: new Date().toISOString(),
          },
        });

        newStripePriceId = stripePrice.id;

        // Archive the old price in Stripe
        if (currentPass.stripePriceId) {
          await stripe.prices.update(currentPass.stripePriceId, {
            active: false,
          });
        }
      } catch (stripeError) {
        console.error('Stripe price creation failed:', stripeError);
        return {
          success: false,
          error: new Error(
            `Failed to create Stripe price: ${stripeError instanceof Error ? stripeError.message : 'Unknown error'}`
          ),
        };
      }
    }

    // 3. Record price change in history
    const [priceHistoryRecord] = await db
      .insert(passPriceHistory)
      .values({
        passId: params.passId,
        oldPrice,
        newPrice,
        oldStripePriceId: currentPass.stripePriceId || undefined,
        newStripePriceId,
        changedBy: params.changedBy || 'system',
        changeReason: params.changeReason,
        effectiveDate: params.effectiveDate || new Date(),
      } as any)
      .returning();

    // 4. Update the pass with new price
    const updateData: Record<string, unknown> = {
      monthlyAmount: newPrice,
    };

    if (newStripePriceId) {
      updateData['stripePriceId'] = newStripePriceId;
    }

    const [updatedPass] = await db
      .update(passes)
      .set(updateData as any)
      .where(eq(passes.id, params.passId))
      .returning();

    if (!updatedPass || !priceHistoryRecord) {
      throw new Error('Failed to update pass or create history record');
    }

    console.log(
      `✓ Updated pass ${params.passId} price: $${oldPrice} → $${newPrice}${newStripePriceId ? ` (Stripe: ${newStripePriceId})` : ''}`
    );

    // 6. Migrate existing subscriptions to new price (unless explicitly skipped)
    let migrationResults;
    if (!params.skipSubscriptionMigration && newStripePriceId) {
      console.log(`🔄 Migrating existing subscriptions to new price...`);

      // Get all active subscriptions for this pass
      const activeSubscriptions = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.passId, params.passId));

      const migrationDetails: Array<{
        subscriptionId: string;
        userId: string;
        status: 'migrated' | 'failed';
        error?: string;
      }> = [];

      let successful = 0;
      let failed = 0;

      for (const subscription of activeSubscriptions) {
        try {
          // Skip if subscription doesn't have Stripe subscription ID
          if (!subscription.stripeSubscriptionId) {
            continue;
          }

          // Skip if already on the new price
          if (subscription.stripePriceId === newStripePriceId) {
            continue;
          }

          // Get Stripe subscription
          const stripeSubscription = await stripe.subscriptions.retrieve(
            subscription.stripeSubscriptionId
          );

          // Get subscription item ID
          const subscriptionItemId = stripeSubscription.items.data[0]?.id;

          if (subscriptionItemId) {
            // Update Stripe subscription to new price with proration
            await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
              items: [
                {
                  id: subscriptionItemId,
                  price: newStripePriceId,
                },
              ],
              proration_behavior: 'create_prorations',
            });

            // Update database
            await db
              .update(subscriptions)
              .set({
                stripePriceId: newStripePriceId,
                monthlyAmount: newPrice,
                updatedAt: new Date(),
              } as any)
              .where(eq(subscriptions.id, subscription.id));

            successful++;
            migrationDetails.push({
              subscriptionId: subscription.id,
              userId: subscription.userId,
              status: 'migrated',
            });

            console.log(
              `  ✓ Migrated subscription ${subscription.id} for user ${subscription.userId}`
            );
          }
        } catch (error) {
          failed++;
          migrationDetails.push({
            subscriptionId: subscription.id,
            userId: subscription.userId,
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error',
          });

          console.error(
            `  ✗ Failed to migrate subscription ${subscription.id}:`,
            error
          );
        }
      }

      migrationResults = {
        total: activeSubscriptions.length,
        successful,
        failed,
        details: migrationDetails,
      };

      console.log(
        `✓ Migration complete: ${successful} successful, ${failed} failed`
      );
    }

    return {
      success: true,
      data: {
        pass: updatedPass,
        priceHistory: priceHistoryRecord,
        oldPrice,
        newPrice,
        ...(newStripePriceId && { newStripePriceId }),
        ...(migrationResults && { subscriptionsMigrated: migrationResults }),
      },
    };
  } catch (error) {
    console.error('Error updating pass price:', error);
    return {
      success: false,
      error: new Error(
        error instanceof Error ? error.message : 'Failed to update pass price'
      ),
    };
  }
}

/**
 * Get price history for a pass
 */
export async function getPassPriceHistory(passId: string): Promise<
  Result<
    Array<{
      id: string;
      passId: string;
      oldPrice: string | null;
      newPrice: string;
      oldStripePriceId: string | null;
      newStripePriceId: string | null;
      changedBy: string | null;
      changeReason: string | null;
      effectiveDate: Date;
      createdAt: Date;
    }>
  >
> {
  try {
    const history = await db
      .select()
      .from(passPriceHistory)
      .where(eq(passPriceHistory.passId, passId))
      .orderBy(passPriceHistory.effectiveDate);

    return {
      success: true,
      data: history,
    };
  } catch (error) {
    console.error('Error fetching price history:', error);
    return {
      success: false,
      error: new Error(
        error instanceof Error
          ? error.message
          : 'Failed to fetch price history'
      ),
    };
  }
}

/**
 * Get current price for a pass at a specific date
 */
export async function getPassPriceAtDate(
  passId: string,
  _date: Date
): Promise<Result<{ price: string; stripePriceId?: string }>> {
  try {
    const [priceRecord] = await db
      .select()
      .from(passPriceHistory)
      .where(eq(passPriceHistory.passId, passId))
      .orderBy(passPriceHistory.effectiveDate)
      .limit(1);

    if (!priceRecord) {
      // No history, get current price from pass
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

      return {
        success: true,
        data: {
          price: pass.monthlyAmount,
          ...(pass.stripePriceId && { stripePriceId: pass.stripePriceId }),
        },
      };
    }

    return {
      success: true,
      data: {
        price: priceRecord.newPrice,
        ...(priceRecord.newStripePriceId && {
          stripePriceId: priceRecord.newStripePriceId,
        }),
      },
    };
  } catch (error) {
    console.error('Error fetching price at date:', error);
    return {
      success: false,
      error: new Error(
        error instanceof Error
          ? error.message
          : 'Failed to fetch price at date'
      ),
    };
  }
}

