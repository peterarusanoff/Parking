import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';

import {
  db,
  paymentMethods,
  payments,
  subscriptions,
  users,
  webhookEvents,
} from '@/database/index';
import type { NewWebhookEvent } from '@/database/schema';
import { env } from '@/env';

import { stripe } from './stripe-client';

/**
 * Verify Stripe webhook signature
 * This ensures the webhook request actually came from Stripe
 *
 * Uses async version of constructEvent for Bun compatibility
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signature: string
): Promise<Stripe.Event> {
  console.log('🔐 [VERIFY] Starting signature verification');
  console.log(
    '🔑 [VERIFY] Webhook secret configured:',
    !!env.STRIPE_WEBHOOK_SECRET
  );

  if (!env.STRIPE_WEBHOOK_SECRET) {
    console.error('❌ [VERIFY] Stripe webhook secret not configured');
    throw new Error('Stripe webhook secret not configured');
  }

  try {
    console.log('🔍 [VERIFY] Constructing event from signature (async)');
    const event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      env.STRIPE_WEBHOOK_SECRET
    );
    console.log('✅ [VERIFY] Event constructed successfully:', event.type);
    return event;
  } catch (error) {
    console.error('❌ [VERIFY] Signature verification failed:', error);
    if (error instanceof Error) {
      console.error('❌ [VERIFY] Error message:', error.message);
    }
    throw new Error('Invalid webhook signature');
  }
}

/**
 * Log webhook event to database for idempotency and debugging
 * Returns the existing event if already processed
 */
async function logWebhookEvent(
  event: Stripe.Event
): Promise<{ isNew: boolean; eventId: string }> {
  console.log('💾 [LOG] Checking if event exists in DB:', event.id);

  // Check if we've already processed this event
  const [existingEvent] = await db
    .select()
    .from(webhookEvents)
    .where(eq(webhookEvents.stripeEventId, event.id))
    .limit(1);

  if (existingEvent) {
    console.log('⏭️  [LOG] Event already exists, skipping:', event.id);
    return { isNew: false, eventId: existingEvent.id };
  }

  console.log('➕ [LOG] Inserting new event into DB:', event.id, event.type);

  // Log the new event
  const newEvent: NewWebhookEvent = {
    stripeEventId: event.id,
    type: event.type,
    status: 'pending',
    payload: event as unknown as Record<string, unknown>,
  };

  const [savedEvent] = await db
    .insert(webhookEvents)
    .values(newEvent)
    .returning();

  console.log('✅ [LOG] Event saved to DB with ID:', savedEvent!.id);
  return { isNew: true, eventId: savedEvent!.id };
}

/**
 * Mark webhook event as processed
 */
async function markEventProcessed(eventId: string): Promise<void> {
  await db
    .update(webhookEvents)
    .set({
      status: 'processed',
      processedAt: new Date(),
    })
    .where(eq(webhookEvents.id, eventId));
}

/**
 * Mark webhook event as failed
 */
async function markEventFailed(
  eventId: string,
  errorMessage: string
): Promise<void> {
  await db
    .update(webhookEvents)
    .set({
      status: 'failed',
      errorMessage,
    })
    .where(eq(webhookEvents.id, eventId));
}

/**
 * Process Stripe webhook events
 * This is the main handler that routes events to specific processors
 */
export async function processWebhookEvent(event: Stripe.Event): Promise<void> {
  console.log(
    '🚀 [PROCESS] Starting webhook event processing:',
    event.type,
    event.id
  );

  const { isNew, eventId } = await logWebhookEvent(event);

  // If we've already processed this event, skip it (idempotency)
  if (!isNew) {
    console.log(`⏭️  [PROCESS] Event ${event.id} already processed, skipping`);
    return;
  }

  console.log('🔄 [PROCESS] Marking event as processing:', eventId);

  // Mark as processing
  await db
    .update(webhookEvents)
    .set({ status: 'processing' })
    .where(eq(webhookEvents.id, eventId));

  try {
    console.log('🔀 [PROCESS] Routing event type:', event.type);

    // Route to specific event handlers
    switch (event.type) {
      // Customer events
      case 'customer.created':
      case 'customer.updated':
        console.log('👤 [HANDLER] Processing customer.created/updated');
        await handleCustomerUpdated(event.data.object as Stripe.Customer);
        break;

      case 'customer.deleted':
        console.log('👤 [HANDLER] Processing customer.deleted');
        await handleCustomerDeleted(event.data.object as Stripe.Customer);
        break;

      // Payment method events
      case 'payment_method.attached':
        console.log('💳 [HANDLER] Processing payment_method.attached');
        await handlePaymentMethodAttached(
          event.data.object as Stripe.PaymentMethod
        );
        break;

      case 'payment_method.detached':
        console.log('💳 [HANDLER] Processing payment_method.detached');
        await handlePaymentMethodDetached(
          event.data.object as Stripe.PaymentMethod
        );
        break;

      case 'payment_method.updated':
        console.log('💳 [HANDLER] Processing payment_method.updated');
        await handlePaymentMethodUpdated(
          event.data.object as Stripe.PaymentMethod
        );
        break;

      // Subscription events
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        console.log('📋 [HANDLER] Processing subscription.created/updated');
        await handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription
        );
        break;

      case 'customer.subscription.deleted':
        console.log('📋 [HANDLER] Processing subscription.deleted');
        await handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription
        );
        break;

      // Payment intent events
      case 'payment_intent.succeeded':
        console.log('💰 [HANDLER] Processing payment_intent.succeeded');
        await handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;

      case 'payment_intent.payment_failed':
        console.log('💰 [HANDLER] Processing payment_intent.payment_failed');
        await handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
        break;

      // Invoice events
      case 'invoice.paid':
        console.log('🧾 [HANDLER] Processing invoice.paid');
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        console.log('🧾 [HANDLER] Processing invoice.payment_failed');
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        console.log(`⚠️  [HANDLER] Unhandled event type: ${event.type}`);
    }

    console.log('✅ [PROCESS] Marking event as processed:', eventId);
    await markEventProcessed(eventId);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error processing webhook event ${event.id}:`, error);
    await markEventFailed(eventId, errorMessage);
    throw error;
  }
}

// ============================================================================
// Event Handlers
// ============================================================================

/**
 * Handle customer created/updated
 */
async function handleCustomerUpdated(customer: Stripe.Customer): Promise<void> {
  // Update user with Stripe customer information
  const updateData: Record<string, unknown> = {};
  if (customer.email) {
    updateData['email'] = customer.email;
  }
  if (customer.phone) {
    updateData['phone'] = customer.phone;
  }

  if (Object.keys(updateData).length > 0) {
    await db
      .update(users)
      .set(updateData as any)
      .where(eq(users.stripeCustomerId, customer.id));
  }
}

/**
 * Handle customer deleted
 */
async function handleCustomerDeleted(customer: Stripe.Customer): Promise<void> {
  // Remove Stripe customer ID from user
  await db
    .update(users)
    .set({
      stripeCustomerId: null,
    })
    .where(eq(users.stripeCustomerId, customer.id));
}

/**
 * Handle payment method attached
 */
async function handlePaymentMethodAttached(
  paymentMethod: Stripe.PaymentMethod
): Promise<void> {
  if (!paymentMethod.customer) return;

  const customerId =
    typeof paymentMethod.customer === 'string'
      ? paymentMethod.customer
      : paymentMethod.customer.id;

  // Find user by Stripe customer ID
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.stripeCustomerId, customerId))
    .limit(1);

  if (!user) {
    console.warn(`User not found for customer ${customerId}`);
    return;
  }

  // Check if payment method already exists
  const [existingPM] = await db
    .select()
    .from(paymentMethods)
    .where(eq(paymentMethods.stripePaymentMethodId, paymentMethod.id))
    .limit(1);

  if (existingPM) {
    console.log(`Payment method ${paymentMethod.id} already exists`);
    return;
  }

  // Add to database if not already there
  await db.insert(paymentMethods).values({
    userId: user.id,
    stripePaymentMethodId: paymentMethod.id,
    type: paymentMethod.type,
    isDefault: false,
    ...(paymentMethod.type === 'card' &&
      paymentMethod.card && {
        cardBrand: paymentMethod.card.brand,
        cardLast4: paymentMethod.card.last4,
        cardExpMonth: paymentMethod.card.exp_month,
        cardExpYear: paymentMethod.card.exp_year,
      }),
    metadata: paymentMethod.metadata as Record<string, unknown>,
  });
}

/**
 * Handle payment method detached
 */
async function handlePaymentMethodDetached(
  paymentMethod: Stripe.PaymentMethod
): Promise<void> {
  // Remove from database
  await db
    .delete(paymentMethods)
    .where(eq(paymentMethods.stripePaymentMethodId, paymentMethod.id));
}

/**
 * Handle payment method updated
 */
async function handlePaymentMethodUpdated(
  paymentMethod: Stripe.PaymentMethod
): Promise<void> {
  // Update in database
  await db
    .update(paymentMethods)
    .set({
      ...(paymentMethod.type === 'card' &&
        paymentMethod.card && {
          cardBrand: paymentMethod.card.brand,
          cardLast4: paymentMethod.card.last4,
          cardExpMonth: paymentMethod.card.exp_month,
          cardExpYear: paymentMethod.card.exp_year,
        }),
      metadata: paymentMethod.metadata as Record<string, unknown>,
    })
    .where(eq(paymentMethods.stripePaymentMethodId, paymentMethod.id));
}

/**
 * Handle subscription created/updated
 */
async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription
): Promise<void> {
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id;

  // Find user by Stripe customer ID
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.stripeCustomerId, customerId))
    .limit(1);

  if (!user) {
    console.warn(`User not found for customer ${customerId}`);
    return;
  }

  // Update subscription in database
  await db
    .update(subscriptions)
    .set({
      status: subscription.status as
        | 'active'
        | 'past_due'
        | 'canceled'
        | 'unpaid'
        | 'trialing',
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: subscription.canceled_at
        ? new Date(subscription.canceled_at * 1000)
        : null,
    })
    .where(eq(subscriptions.stripeSubscriptionId, subscription.id));
}

/**
 * Handle subscription deleted
 */
async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription
): Promise<void> {
  // Update subscription status to canceled
  await db
    .update(subscriptions)
    .set({
      status: 'canceled',
      canceledAt: new Date(),
    })
    .where(eq(subscriptions.stripeSubscriptionId, subscription.id));
}

/**
 * Handle payment intent succeeded
 */
async function handlePaymentSucceeded(
  paymentIntent: Stripe.PaymentIntent
): Promise<void> {
  // Update payment record if it exists
  await db
    .update(payments)
    .set({
      status: 'succeeded',
    })
    .where(eq(payments.stripePaymentIntentId, paymentIntent.id));
}

/**
 * Handle payment intent failed
 */
async function handlePaymentFailed(
  paymentIntent: Stripe.PaymentIntent
): Promise<void> {
  // Update payment record if it exists
  await db
    .update(payments)
    .set({
      status: 'failed',
    })
    .where(eq(payments.stripePaymentIntentId, paymentIntent.id));
}

/**
 * Handle invoice paid
 */
async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  if (!invoice.subscription) return;

  const subscriptionId =
    typeof invoice.subscription === 'string'
      ? invoice.subscription
      : invoice.subscription.id;

  // Find subscription
  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, subscriptionId))
    .limit(1);

  if (!subscription) {
    console.warn(`Subscription not found for invoice ${invoice.id}`);
    return;
  }

  // Create payment record if it doesn't exist
  const paymentIntentId =
    typeof invoice.payment_intent === 'string'
      ? invoice.payment_intent
      : invoice.payment_intent?.id;

  if (paymentIntentId) {
    const [existingPayment] = await db
      .select()
      .from(payments)
      .where(eq(payments.stripePaymentIntentId, paymentIntentId))
      .limit(1);

    if (!existingPayment) {
      // Amounts in cents
      const stripeFeeCents = invoice.application_fee_amount || 0;
      const amountCents = invoice.amount_paid || 0;
      const netAmountCents = amountCents - stripeFeeCents;

      await db.insert(payments).values({
        stripePaymentIntentId: paymentIntentId,
        subscriptionId: subscription.id,
        garageId: subscription.garageId,
        amount: amountCents as any,
        stripeFee: stripeFeeCents as any,
        netAmount: netAmountCents as any,
        status: 'succeeded',
        currency: invoice.currency,
        paymentDate: new Date(),
      });
    }
  }
}

/**
 * Handle invoice payment failed
 */
async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice
): Promise<void> {
  if (!invoice.subscription) return;

  const subscriptionId =
    typeof invoice.subscription === 'string'
      ? invoice.subscription
      : invoice.subscription.id;

  // Update subscription status
  await db
    .update(subscriptions)
    .set({
      status: 'past_due',
    })
    .where(eq(subscriptions.stripeSubscriptionId, subscriptionId));
}
