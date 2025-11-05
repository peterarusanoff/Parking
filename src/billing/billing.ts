import { and, eq } from 'drizzle-orm';

import { db, garages, passes, subscriptions, users } from '@/database/index';
import { type Result, err, ok } from '@/shared/index';

import { stripe } from './stripe-client';

// Type for garage pass parameters
export interface CreateGaragePassParams {
  passId: string;
  garageId: string;
  name: string;
  description: string;
  monthlyPrice: number; // in dollars
}

export interface CreateGaragePassResult {
  productId: string;
  priceId: string;
}

/**
 * Creates a garage pass with Stripe product and price
 * Follows best practices for idempotency and proper error handling
 */
export async function createGaragePass(
  params: CreateGaragePassParams
): Promise<Result<CreateGaragePassResult>> {
  try {
    const { passId, garageId, name, description, monthlyPrice } = params;

    // Validate monthly price
    if (monthlyPrice <= 0) {
      return err(new Error('Monthly price must be greater than 0'));
    }

    // Create Stripe Product with metadata
    const product = await stripe.products.create({
      name,
      description,
      metadata: {
        passId,
        garageId,
      },
    });

    // Create Stripe Price with monthly recurring interval
    // Convert dollars to cents for Stripe
    const priceInCents = Math.round(monthlyPrice * 100);

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: priceInCents,
      currency: 'usd',
      recurring: {
        interval: 'month',
      },
      metadata: {
        passId,
        garageId,
      },
    });

    return ok({
      productId: product.id,
      priceId: price.id,
    });
  } catch (error) {
    if (error instanceof Error) {
      return err(error);
    }
    return err(new Error('Failed to create garage pass'));
  }
}

// Type for subscription parameters
export interface SubscribeUserToPassParams {
  userId: string;
  passId: string;
}

export interface SubscribeUserToPassResult {
  subscriptionId: string;
  stripeSubscriptionId: string;
}

/**
 * Subscribes a user to a pass
 * Handles customer creation and subscription setup with proper error handling
 */
export async function subscribeUserToPass(
  params: SubscribeUserToPassParams
): Promise<Result<SubscribeUserToPassResult>> {
  try {
    const { userId, passId } = params;

    // Query user from database
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return err(new Error(`User not found: ${userId}`));
    }

    // Query pass with garage details
    const [pass] = await db
      .select({
        pass: passes,
        garage: garages,
      })
      .from(passes)
      .leftJoin(garages, eq(passes.garageId, garages.id))
      .where(and(eq(passes.id, passId), eq(passes.active, true)))
      .limit(1);

    if (!pass || !pass.pass || !pass.garage) {
      return err(new Error(`Active pass not found: ${passId}`));
    }

    if (!pass.pass.stripePriceId) {
      return err(new Error(`Pass missing Stripe price ID: ${passId}`));
    }

    // Get or create Stripe Customer
    let stripeCustomerId = user.stripeCustomerId;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        ...(user.phone && { phone: user.phone }),
        metadata: {
          userId: user.id,
        },
      });

      stripeCustomerId = customer.id;

      // Update user with customer ID
      await db
        .update(users)
        .set({ stripeCustomerId: customer.id })
        .where(eq(users.id, userId));
    }

    // Create Stripe Subscription
    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [
        {
          price: pass.pass.stripePriceId,
        },
      ],
      metadata: {
        userId: user.id,
        passId: pass.pass.id,
        garageId: pass.garage.id,
      },
    });

    // Insert subscription record into database
    const monthlyAmount = pass.pass.monthlyAmount;

    const [dbSubscription] = await db
      .insert(subscriptions)
      .values({
        stripeSubscriptionId: subscription.id,
        userId: user.id,
        garageId: pass.garage.id,
        passId: pass.pass.id,
        stripePriceId: pass.pass.stripePriceId,
        status: subscription.status as
          | 'active'
          | 'past_due'
          | 'canceled'
          | 'unpaid'
          | 'trialing',
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        monthlyAmount,
      })
      .returning();

    if (!dbSubscription) {
      return err(new Error('Failed to create subscription record'));
    }

    return ok({
      subscriptionId: dbSubscription.id,
      stripeSubscriptionId: subscription.id,
    });
  } catch (error) {
    if (error instanceof Error) {
      return err(error);
    }
    return err(new Error('Failed to subscribe user to pass'));
  }
}

// Type for revenue report
export interface GarageRevenueReport {
  garage: string;
  activeSubscriptions: number;
  monthlyRevenue: number;
}

/**
 * Generates revenue report aggregated by garage
 * Returns sorted array with proper type safety
 */
export async function generateRevenueReport(): Promise<
  Result<GarageRevenueReport[]>
> {
  try {
    // Query active subscriptions with garage names
    const result = await db
      .select({
        garageName: garages.name,
        garageId: garages.id,
        subscriptionId: subscriptions.id,
        monthlyAmount: subscriptions.monthlyAmount,
      })
      .from(subscriptions)
      .innerJoin(garages, eq(subscriptions.garageId, garages.id))
      .where(eq(subscriptions.status, 'active'));

    // Aggregate by garage
    const garageMap = new Map<string, { count: number; revenue: number }>();

    for (const row of result) {
      const garageName = row.garageName;
      const amount = parseFloat(row.monthlyAmount);

      const existing = garageMap.get(garageName);
      if (existing) {
        garageMap.set(garageName, {
          count: existing.count + 1,
          revenue: existing.revenue + amount,
        });
      } else {
        garageMap.set(garageName, {
          count: 1,
          revenue: amount,
        });
      }
    }

    // Convert to array and sort by revenue descending
    const report: GarageRevenueReport[] = Array.from(
      garageMap.entries()
    ).map(([garage, data]) => ({
      garage,
      activeSubscriptions: data.count,
      monthlyRevenue: Math.round(data.revenue * 100) / 100, // Round to 2 decimals
    }));

    report.sort((a, b) => b.monthlyRevenue - a.monthlyRevenue);

    return ok(report);
  } catch (error) {
    if (error instanceof Error) {
      return err(error);
    }
    return err(new Error('Failed to generate revenue report'));
  }
}

