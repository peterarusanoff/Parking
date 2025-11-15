import { and, eq } from 'drizzle-orm';

import { db, paymentMethods, users } from '@/database/index';
import type { NewPaymentMethod } from '@/database/schema';
import type { Result } from '@/shared/index';

import { stripe } from './stripe-client';

/**
 * Add a payment method to a user's Stripe customer and save to database
 * The payment method must be created client-side first (using Stripe Elements)
 * and then attached to the customer server-side
 */
export async function addPaymentMethod(
  userId: string,
  stripePaymentMethodId: string,
  setAsDefault = false
): Promise<Result<typeof paymentMethods.$inferSelect>> {
  try {
    // Get the user and their Stripe customer ID
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return {
        success: false,
        error: new Error('User not found'),
      };
    }

    if (!user.stripeCustomerId) {
      return {
        success: false,
        error: new Error('User does not have a Stripe customer ID'),
      };
    }

    // Normalize test shorthand IDs like "pm_card_visa" by creating a real PaymentMethod first
    let paymentMethodIdToAttach = stripePaymentMethodId;
    const shorthandMap: Record<string, string> = {
      pm_card_visa: 'tok_visa',
      pm_card_mastercard: 'tok_mastercard',
      pm_card_amex: 'tok_amex',
      pm_card_discover: 'tok_discover',
    };
    if (stripePaymentMethodId in shorthandMap) {
      const token = shorthandMap[stripePaymentMethodId];
      if (!token) {
        throw new Error('Unsupported Stripe test payment method shorthand');
      }
      const created = await stripe.paymentMethods.create({
        type: 'card',
        card: { token },
      });
      paymentMethodIdToAttach = created.id;
    }

    // Attach the payment method to the Stripe customer
    const stripePaymentMethod = await stripe.paymentMethods.attach(
      paymentMethodIdToAttach,
      {
        customer: user.stripeCustomerId,
      }
    );

    // If this should be the default, update the customer's default payment method
    if (setAsDefault) {
      await stripe.customers.update(user.stripeCustomerId, {
        invoice_settings: {
          default_payment_method: stripePaymentMethod.id,
        },
      });

      // Unset any existing default payment methods for this user
      await db
        .update(paymentMethods)
        .set({ isDefault: false })
        .where(eq(paymentMethods.userId, userId));
    }

    // Save to database
    const newPaymentMethod: NewPaymentMethod = {
      userId,
      stripePaymentMethodId: stripePaymentMethod.id,
      type: stripePaymentMethod.type,
      isDefault: setAsDefault,
      // Extract card details if it's a card payment method
      ...(stripePaymentMethod.type === 'card' &&
        stripePaymentMethod.card && {
          cardBrand: stripePaymentMethod.card.brand,
          cardLast4: stripePaymentMethod.card.last4,
          cardExpMonth: stripePaymentMethod.card.exp_month,
          cardExpYear: stripePaymentMethod.card.exp_year,
        }),
      metadata: stripePaymentMethod.metadata as Record<string, unknown>,
    };

    const [savedPaymentMethod] = await db
      .insert(paymentMethods)
      .values(newPaymentMethod)
      .returning();

    if (!savedPaymentMethod) {
      throw new Error('Failed to save payment method to database');
    }

    return {
      success: true,
      data: savedPaymentMethod,
    };
  } catch (error) {
    console.error('Error adding payment method:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to add payment method';
    return {
      success: false,
      error: new Error(errorMessage),
    };
  }
}

/**
 * Remove a payment method from a user's Stripe customer and database
 * This detaches the payment method from the customer
 */
export async function removePaymentMethod(
  userId: string,
  paymentMethodId: string
): Promise<Result<{ success: boolean }>> {
  try {
    // Get the payment method from database
    const [paymentMethod] = await db
      .select()
      .from(paymentMethods)
      .where(
        and(
          eq(paymentMethods.userId, userId),
          eq(paymentMethods.id, paymentMethodId)
        )
      )
      .limit(1);

    if (!paymentMethod) {
      return {
        success: false,
        error: new Error('Payment method not found'),
      };
    }

    // Detach from Stripe
    await stripe.paymentMethods.detach(paymentMethod.stripePaymentMethodId);

    // Delete from database
    await db
      .delete(paymentMethods)
      .where(
        and(
          eq(paymentMethods.userId, userId),
          eq(paymentMethods.id, paymentMethodId)
        )
      );

    return {
      success: true,
      data: { success: true },
    };
  } catch (error) {
    console.error('Error removing payment method:', error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Failed to remove payment method';
    return {
      success: false,
      error: new Error(errorMessage),
    };
  }
}

/**
 * Set a payment method as the default for a user
 */
export async function setDefaultPaymentMethod(
  userId: string,
  paymentMethodId: string
): Promise<Result<typeof paymentMethods.$inferSelect>> {
  try {
    // Get the payment method from database
    const [paymentMethod] = await db
      .select()
      .from(paymentMethods)
      .where(
        and(
          eq(paymentMethods.userId, userId),
          eq(paymentMethods.id, paymentMethodId)
        )
      )
      .limit(1);

    if (!paymentMethod) {
      return {
        success: false,
        error: new Error('Payment method not found'),
      };
    }

    // Get user to get Stripe customer ID
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user || !user.stripeCustomerId) {
      return {
        success: false,
        error: new Error('User or Stripe customer not found'),
      };
    }

    // Update Stripe customer's default payment method
    await stripe.customers.update(user.stripeCustomerId, {
      invoice_settings: {
        default_payment_method: paymentMethod.stripePaymentMethodId,
      },
    });

    // Unset all other default payment methods for this user
    await db
      .update(paymentMethods)
      .set({ isDefault: false })
      .where(eq(paymentMethods.userId, userId));

    // Set this one as default
    const [updatedPaymentMethod] = await db
      .update(paymentMethods)
      .set({ isDefault: true })
      .where(
        and(
          eq(paymentMethods.userId, userId),
          eq(paymentMethods.id, paymentMethodId)
        )
      )
      .returning();

    if (!updatedPaymentMethod) {
      throw new Error('Failed to update payment method');
    }

    return {
      success: true,
      data: updatedPaymentMethod,
    };
  } catch (error) {
    console.error('Error setting default payment method:', error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Failed to set default payment method';
    return {
      success: false,
      error: new Error(errorMessage),
    };
  }
}

/**
 * Get all payment methods for a user
 */
export async function getUserPaymentMethods(
  userId: string
): Promise<Result<(typeof paymentMethods.$inferSelect)[]>> {
  try {
    const userPaymentMethods = await db
      .select()
      .from(paymentMethods)
      .where(eq(paymentMethods.userId, userId));

    return {
      success: true,
      data: userPaymentMethods,
    };
  } catch (error) {
    console.error('Error getting user payment methods:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to get payment methods';
    return {
      success: false,
      error: new Error(errorMessage),
    };
  }
}
