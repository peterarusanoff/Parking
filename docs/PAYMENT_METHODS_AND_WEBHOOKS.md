# Payment Methods and Stripe Webhooks

This document describes the payment method management and Stripe webhook integration features.

## Overview

Two major features have been added to the VendPark API:

1. **Payment Method Management**: Users can add, remove, and manage payment methods
2. **Stripe Webhooks**: Full webhook integration with signature validation and event processing

## Payment Method Management

### Database Schema

A new `payment_methods` table has been added with the following structure:

```sql
payment_methods
├── id (uuid, primary key)
├── user_id (uuid, foreign key to users)
├── stripe_payment_method_id (varchar, unique)
├── type (varchar) - e.g., 'card', 'bank_account'
├── is_default (boolean)
├── card_brand (varchar) - e.g., 'visa', 'mastercard'
├── card_last4 (varchar)
├── card_exp_month (integer)
├── card_exp_year (integer)
├── metadata (jsonb)
├── created_at (timestamp)
└── updated_at (timestamp)
```

### API Endpoints

All payment method endpoints are nested under the users routes:

#### 1. Get User Payment Methods
```
GET /api/users/:id/payment-methods
```
Returns all payment methods for a specific user.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "userId": "uuid",
      "stripePaymentMethodId": "pm_xxx",
      "type": "card",
      "isDefault": true,
      "cardBrand": "visa",
      "cardLast4": "4242",
      "cardExpMonth": 12,
      "cardExpYear": 2025,
      "createdAt": "2025-01-01T00:00:00Z",
      "updatedAt": "2025-01-01T00:00:00Z"
    }
  ]
}
```

#### 2. Add Payment Method
```
POST /api/users/:id/payment-methods
```
Attaches a payment method to a user's Stripe customer.

**Request Body:**
```json
{
  "stripePaymentMethodId": "pm_xxx",
  "setAsDefault": false
}
```

**Important:** The payment method must be created client-side first using Stripe Elements or the Stripe SDK before being attached server-side.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "userId": "uuid",
    "stripePaymentMethodId": "pm_xxx",
    "type": "card",
    "isDefault": false,
    "cardBrand": "visa",
    "cardLast4": "4242"
  },
  "message": "Payment method added successfully"
}
```

#### 3. Set Default Payment Method
```
PATCH /api/users/:id/payment-methods/:paymentMethodId/default
```
Sets a payment method as the default for a user. This automatically unsets any previous default.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "isDefault": true
  },
  "message": "Default payment method updated successfully"
}
```

#### 4. Remove Payment Method
```
DELETE /api/users/:id/payment-methods/:paymentMethodId
```
Detaches and removes a payment method from the user.

**Response:**
```json
{
  "success": true,
  "data": {
    "success": true
  },
  "message": "Payment method removed successfully"
}
```

## Stripe Webhooks

### Database Schema

A new `webhook_events` table has been added for logging and idempotency:

```sql
webhook_events
├── id (uuid, primary key)
├── stripe_event_id (varchar, unique)
├── type (varchar) - event type
├── status (enum) - pending, processing, processed, failed
├── payload (jsonb) - full event data
├── processed_at (timestamp)
├── error_message (text)
├── retry_count (integer)
├── created_at (timestamp)
└── updated_at (timestamp)
```

### API Endpoints

#### Webhook Endpoint
```
POST /api/webhooks/stripe
```
Receives Stripe webhook events with signature validation.

**Headers Required:**
- `stripe-signature`: Stripe webhook signature for validation

**How it Works:**
1. Validates the webhook signature using `STRIPE_WEBHOOK_SECRET`
2. Logs the event to the database (idempotency - duplicate events are skipped)
3. Marks the event as "processing"
4. Routes to the appropriate event handler
5. Marks as "processed" or "failed" based on outcome

**Response:**
```json
{
  "success": true,
  "data": {
    "received": true,
    "eventId": "evt_xxx"
  },
  "message": "Webhook processed successfully"
}
```

#### Test Endpoint (Development)
```
GET /api/webhooks/stripe/test
```
Verifies the webhook endpoint is accessible.

### Supported Webhook Events

The system handles the following Stripe webhook events:

#### Customer Events
- `customer.created` - Syncs customer data to user
- `customer.updated` - Updates user with Stripe customer changes
- `customer.deleted` - Removes Stripe customer ID from user

#### Payment Method Events
- `payment_method.attached` - Adds payment method to database
- `payment_method.detached` - Removes payment method from database
- `payment_method.updated` - Updates payment method details (e.g., exp date)

#### Subscription Events
- `customer.subscription.created` - Creates subscription record
- `customer.subscription.updated` - Updates subscription status and dates
- `customer.subscription.deleted` - Marks subscription as canceled

#### Payment Intent Events
- `payment_intent.succeeded` - Marks payment as succeeded
- `payment_intent.payment_failed` - Marks payment as failed

#### Invoice Events
- `invoice.paid` - Creates payment record when invoice is paid
- `invoice.payment_failed` - Updates subscription status to past_due

### Setting Up Webhooks

#### 1. Configure Environment Variable
Add your Stripe webhook secret to `.env`:

```env
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
```

#### 2. Create Webhook in Stripe Dashboard

1. Go to Stripe Dashboard → Developers → Webhooks
2. Click "Add endpoint"
3. Set endpoint URL: `https://your-domain.com/api/webhooks/stripe`
4. Select events to listen to (or select "all events")
5. Copy the webhook signing secret and add to `.env`

#### 3. Test Webhooks Locally

Use Stripe CLI to forward webhooks to localhost:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

This will give you a webhook signing secret for testing.

### Webhook Security

The webhook endpoint implements several security measures:

1. **Signature Validation**: Every webhook request must have a valid Stripe signature
2. **Idempotency**: Duplicate events are automatically detected and skipped
3. **Error Handling**: Failed events are logged with error messages for debugging
4. **Type Safety**: Full TypeScript types for all Stripe events

### Event Processing Flow

```
Webhook Request
    ↓
Verify Signature (using STRIPE_WEBHOOK_SECRET)
    ↓
Check if Event Already Processed (idempotency)
    ↓
Log Event to Database (status: pending)
    ↓
Mark as Processing (status: processing)
    ↓
Route to Event Handler
    ↓
Update Database Based on Event Type
    ↓
Mark as Processed (status: processed)
    ↓
Return Success Response
```

If any step fails:
```
Error Occurs
    ↓
Mark Event as Failed (status: failed)
    ↓
Log Error Message
    ↓
Return Error Response
```

## Example: Client-Side Payment Method Creation

Here's how to create a payment method on the client side before adding it via the API:

```javascript
// Using Stripe.js on the client
const stripe = Stripe('pk_test_xxxxx');
const elements = stripe.elements();
const cardElement = elements.create('card');
cardElement.mount('#card-element');

// When user submits
const { paymentMethod, error } = await stripe.createPaymentMethod({
  type: 'card',
  card: cardElement,
  billing_details: {
    name: 'John Doe',
    email: 'john@example.com',
  },
});

if (error) {
  console.error(error);
} else {
  // Now send to your API
  await fetch(`/api/users/${userId}/payment-methods`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      stripePaymentMethodId: paymentMethod.id,
      setAsDefault: true,
    }),
  });
}
```

## Database Migrations

The following migrations have been applied:

1. Added `webhook_event_status` enum
2. Created `payment_methods` table with indexes
3. Created `webhook_events` table with indexes

To apply migrations:
```bash
bun run db:push
```

## Monitoring and Debugging

### View Webhook Events
Query the `webhook_events` table to see all received events:

```sql
SELECT * FROM webhook_events 
ORDER BY created_at DESC 
LIMIT 10;
```

### Check Failed Events
```sql
SELECT * FROM webhook_events 
WHERE status = 'failed' 
ORDER BY created_at DESC;
```

### Retry Failed Events
Failed events can be manually retried by re-processing them (implementation pending).

## API Documentation

Full API documentation is available at:
```
http://localhost:3000/swagger
```

Look under the following tags:
- `users` - Payment method endpoints
- `webhooks` - Webhook endpoints

## Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Error message here"
}
```

Common errors:
- `400` - Invalid request or Stripe error
- `404` - User or payment method not found
- `500` - Server error

## Testing

### Test Payment Method Management
```bash
# Add a test payment method
curl -X POST http://localhost:3000/api/users/{userId}/payment-methods \
  -H "Content-Type: application/json" \
  -d '{
    "stripePaymentMethodId": "pm_card_visa",
    "setAsDefault": true
  }'

# List payment methods
curl http://localhost:3000/api/users/{userId}/payment-methods

# Remove payment method
curl -X DELETE http://localhost:3000/api/users/{userId}/payment-methods/{paymentMethodId}
```

### Test Webhooks
```bash
# Test webhook endpoint is reachable
curl http://localhost:3000/api/webhooks/stripe/test

# Use Stripe CLI to send test events
stripe trigger customer.created
stripe trigger payment_method.attached
stripe trigger invoice.paid
```

## Best Practices

1. **Always validate signatures** - Never process webhooks without signature verification
2. **Handle idempotency** - The system automatically handles duplicate events
3. **Monitor failed events** - Regularly check the `webhook_events` table for failures
4. **Use test mode** - Test thoroughly in Stripe test mode before going live
5. **Secure your webhook secret** - Never commit `STRIPE_WEBHOOK_SECRET` to version control

## Future Enhancements

Potential improvements:
- Automatic retry for failed webhook events
- Webhook event replay functionality
- Payment method verification before setting as default
- Support for bank account payment methods
- Payment method expiration notifications

