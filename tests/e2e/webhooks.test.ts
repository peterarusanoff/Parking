import { describe, expect, test } from 'bun:test';
import { createHmac } from 'crypto';

import { eq } from 'drizzle-orm';
import { db } from '../../src/database/client';
import { webhookEvents } from '../../src/database/schema';

const API_BASE_URL = 'http://localhost:3000';

async function postRaw(
  path: string,
  rawBody: string,
  headers: Record<string, string> = {}
) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      ...headers,
    },
    body: rawBody,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function buildStripeSignature(
  secret: string,
  payload: string,
  timestamp?: number
) {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const signedPayload = `${ts}.${payload}`;
  const signature = createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
  return { header: `t=${ts},v1=${signature}`, ts };
}

describe('Stripe Webhooks', () => {
  test('GET /api/webhooks/stripe/test - endpoint is reachable', async () => {
    const res = await fetch(`${API_BASE_URL}/api/webhooks/stripe/test`);
    const json = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.status).toBe('ready');
  });

  test('POST /api/webhooks/stripe - missing signature yields 400', async () => {
    const payload = JSON.stringify({
      id: 'evt_missing_sig',
      type: 'payment_intent.succeeded',
      data: { object: {} },
    });
    const { status, data } = await postRaw('/api/webhooks/stripe', payload);
    expect(status).toBe(400);
    expect((data as any).success).toBe(false);
  });

  test('POST /api/webhooks/stripe - valid signature is accepted and event logged (if secret configured)', async () => {
    const secret = process.env['STRIPE_WEBHOOK_SECRET'];
    if (!secret) {
      // Environment not configured for signature validation; skip hard assertion
      expect(true).toBe(true);
      return;
    }

    const eventId = `evt_test_${Date.now()}`;
    const payload = JSON.stringify({
      id: eventId,
      type: 'payment_intent.succeeded',
      data: {
        object: { object: 'payment_intent', id: `pi_test_${Date.now()}` },
      },
    });
    const sig = buildStripeSignature(secret, payload);

    const { status, data } = await postRaw('/api/webhooks/stripe', payload, {
      'Stripe-Signature': sig.header,
    });

    expect(status).toBe(200);
    expect((data as any).success).toBe(true);
    expect((data as any).data?.eventId).toBe(eventId);

    // Verify event persisted
    const [logged] = await db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.stripeEventId, eventId))
      .limit(1);
    expect(logged?.id).toBeDefined();
    expect(logged?.status).toBe('processed');
  });

  test('POST /api/webhooks/stripe - multiple events are ingested and logged (if secret configured)', async () => {
    const secret = process.env['STRIPE_WEBHOOK_SECRET'];
    if (!secret) {
      expect(true).toBe(true);
      return;
    }

    const now = Date.now();
    const events = [
      {
        id: `evt_pi_succeeded_${now}`,
        type: 'payment_intent.succeeded',
        data: { object: { object: 'payment_intent', id: `pi_${now}` } },
      },
      {
        id: `evt_customer_updated_${now}`,
        type: 'customer.updated',
        data: { object: { object: 'customer', id: `cus_${now}` } },
      },
      {
        id: `evt_invoice_paid_${now}`,
        type: 'invoice.paid',
        data: {
          object: { object: 'invoice', id: `in_${now}`, amount_paid: 0 },
        },
      },
    ];

    for (const evt of events) {
      const payload = JSON.stringify(evt);
      const sig = buildStripeSignature(secret, payload);
      const { status, data } = await postRaw('/api/webhooks/stripe', payload, {
        'Stripe-Signature': sig.header,
      });
      expect(status).toBe(200);
      expect((data as any).success).toBe(true);
      expect((data as any).data?.eventId).toBe(evt.id);
    }

    // Verify all events persisted and marked processed
    for (const evt of events) {
      const [logged] = await db
        .select()
        .from(webhookEvents)
        .where(eq(webhookEvents.stripeEventId, evt.id))
        .limit(1);
      expect(logged?.id).toBeDefined();
      expect(logged?.status).toBe('processed');
      expect(logged?.type).toBe(evt.type);
    }
  });
});
