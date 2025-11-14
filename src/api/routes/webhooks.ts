import { Elysia } from 'elysia';
import type Stripe from 'stripe';

import {
  processWebhookEvent,
  verifyWebhookSignature,
} from '@/billing/webhook-handler';
import { errorResponse, successResponse } from '@/shared/index';
import { testLogger } from '../utils/logger';

/**
 * Stripe webhook routes with signature validation and type safety
 *
 * IMPORTANT: For Stripe webhook signature verification, we MUST receive the raw body
 * exactly as sent. We configure the route to parse the body as text.
 */
export const webhookRoutes = new Elysia({ prefix: '/api/webhooks' })
  // Stripe webhook endpoint
  .post(
    '/stripe',
    async ({ body, headers, set, request }) => {
      testLogger.webhooks.log('🔔 [WEBHOOK] Received Stripe webhook request');
      testLogger.webhooks.log('📋 [WEBHOOK] Headers:', {
        'content-type': headers['content-type'],
        'stripe-signature': headers['stripe-signature'] ? 'present' : 'missing',
      });

      try {
        const signature = headers['stripe-signature'];

        if (!signature) {
          testLogger.webhooks.error(
            '❌ [WEBHOOK] Missing stripe-signature header'
          );
          set.status = 400;
          return errorResponse('Missing stripe-signature header');
        }

        // Get the raw body - for text type, body should be string
        // If not, we need to read from request
        let rawBody: string;
        if (typeof body === 'string') {
          rawBody = body;
        } else {
          // Fallback: read from request if body was parsed
          try {
            rawBody = await request.text();
          } catch {
            rawBody = JSON.stringify(body);
          }
        }

        testLogger.webhooks.log('📦 [WEBHOOK] Raw body type:', typeof rawBody);
        testLogger.webhooks.log(
          '📏 [WEBHOOK] Raw body length:',
          rawBody.length
        );
        testLogger.webhooks.log(
          '🔍 [WEBHOOK] First 100 chars:',
          rawBody.substring(0, 100)
        );

        // Verify webhook signature
        let event: Stripe.Event;
        try {
          testLogger.webhooks.log('🔐 [WEBHOOK] Verifying signature...');
          event = await verifyWebhookSignature(rawBody, signature);
          testLogger.webhooks.log(
            '✅ [WEBHOOK] Signature verified successfully'
          );
          testLogger.webhooks.log(
            '🎯 [WEBHOOK] Event type:',
            event.type,
            'ID:',
            event.id
          );
        } catch (error) {
          testLogger.webhooks.error(
            '❌ [WEBHOOK] Signature verification failed:',
            error
          );
          set.status = 400;
          return errorResponse(
            error instanceof Error ? error.message : 'Invalid signature'
          );
        }

        // Process the webhook event
        testLogger.webhooks.log('⚙️  [WEBHOOK] Processing event:', event.type);
        await processWebhookEvent(event);
        testLogger.webhooks.log(
          '✅ [WEBHOOK] Event processed successfully:',
          event.id
        );

        return successResponse(
          { received: true, eventId: event.id },
          'Webhook processed successfully'
        );
      } catch (error) {
        testLogger.webhooks.error('💥 [WEBHOOK] Processing error:', error);
        set.status = 500;
        return errorResponse(
          error instanceof Error ? error.message : 'Webhook processing failed'
        );
      }
    },
    {
      // Parse body as text to preserve exact formatting for signature verification
      detail: {
        tags: ['webhooks'],
        summary: 'Stripe webhook endpoint',
        description:
          'Receives and processes Stripe webhook events with signature validation. ' +
          'All events are logged to the database for idempotency and debugging. ' +
          'Supports: customer, payment_method, subscription, payment_intent, and invoice events.',
      },
    }
  )
  // Test endpoint to verify webhook is reachable (development only)
  .get(
    '/stripe/test',
    async () => {
      return successResponse(
        {
          status: 'ready',
          message: 'Webhook endpoint is ready to receive Stripe events',
        },
        'Webhook endpoint is operational'
      );
    },
    {
      detail: {
        tags: ['webhooks'],
        summary: 'Test webhook endpoint',
        description:
          'Verify that the webhook endpoint is accessible (for development/testing)',
      },
    }
  );
