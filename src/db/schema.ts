import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// Enums
export const userRoleEnum = pgEnum('user_role', [
  'user',
  'garage_admin',
  'super_admin',
]);

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'trialing',
]);

export const paymentStatusEnum = pgEnum('payment_status', [
  'succeeded',
  'failed',
  'processing',
  'canceled',
]);

export const webhookEventStatusEnum = pgEnum('webhook_event_status', [
  'pending',
  'processing',
  'processed',
  'failed',
]);

// Base Tables
export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    firstName: varchar('first_name', { length: 255 }).notNull(),
    lastName: varchar('last_name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    phone: varchar('phone', { length: 50 }),
    stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
    role: userRoleEnum('role').notNull().default('user'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    emailIdx: index('users_email_idx').on(table.email),
    stripeCustomerIdx: index('users_stripe_customer_idx').on(
      table.stripeCustomerId
    ),
  })
);

export const garages = pgTable(
  'garages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    address: varchar('address', { length: 500 }).notNull(),
    // Total capacity (number of parking spots) in the garage
    // Used to compute available spots: capacity - current occupancy
    capacity: integer('capacity').notNull().default(200),
    stripeAccountId: varchar('stripe_account_id', { length: 255 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    stripeAccountIdx: index('garages_stripe_account_idx').on(
      table.stripeAccountId
    ),
  })
);

// Parked vehicles log
export const parked = pgTable(
  'parked',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    garageId: uuid('garage_id')
      .notNull()
      .references(() => garages.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id),
    passId: uuid('pass_id').references(() => passes.id),
    vehiclePlate: varchar('vehicle_plate', { length: 32 }),
    enteredAt: timestamp('entered_at').notNull().defaultNow(),
    exitedAt: timestamp('exited_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    parkedGarageIdx: index('parked_garage_idx').on(table.garageId),
    parkedEnteredIdx: index('parked_entered_idx').on(table.enteredAt),
    parkedExitedIdx: index('parked_exited_idx').on(table.exitedAt),
  })
);

// Daily occupancy per garage (array of 24 hourly occupancy numbers)
export const garageDailyOccupancy = pgTable(
  'garage_daily_occupancy',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    garageId: uuid('garage_id')
      .notNull()
      .references(() => garages.id, { onDelete: 'cascade' }),
    // Stored as timestamp at midnight (UTC) for the day
    day: timestamp('day').notNull(),
    hourlyOccupancy: jsonb('hourly_occupancy').$type<number[]>().notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    occupancyGarageIdx: index('garage_daily_occupancy_garage_idx').on(
      table.garageId
    ),
    occupancyDayIdx: index('garage_daily_occupancy_day_idx').on(table.day),
  })
);

export const passes = pgTable(
  'passes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    garageId: uuid('garage_id')
      .notNull()
      .references(() => garages.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: varchar('description', { length: 1000 }),
    stripeProductId: varchar('stripe_product_id', { length: 255 }),
    stripePriceId: varchar('stripe_price_id', { length: 255 }),
    monthlyAmount: integer('monthly_amount').notNull(),
    active: boolean('active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    garageIdx: index('passes_garage_idx').on(table.garageId),
    activeIdx: index('passes_active_idx').on(table.active),
    stripeProductIdx: index('passes_stripe_product_idx').on(
      table.stripeProductId
    ),
  })
);

// Pass Price History Table
export const passPriceHistory = pgTable(
  'pass_price_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    passId: uuid('pass_id')
      .notNull()
      .references(() => passes.id, { onDelete: 'cascade' }),
    oldPrice: integer('old_price'),
    newPrice: integer('new_price').notNull(),
    oldStripePriceId: varchar('old_stripe_price_id', { length: 255 }),
    newStripePriceId: varchar('new_stripe_price_id', { length: 255 }),
    changedBy: varchar('changed_by', { length: 255 }),
    changeReason: text('change_reason'),
    effectiveDate: timestamp('effective_date').notNull().defaultNow(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    passIdx: index('pass_price_history_pass_idx').on(table.passId),
    effectiveDateIdx: index('pass_price_history_effective_date_idx').on(
      table.effectiveDate
    ),
  })
);

// Garage Admins Table (RBAC)
export const garageAdmins = pgTable(
  'garage_admins',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    garageId: uuid('garage_id')
      .notNull()
      .references(() => garages.id, { onDelete: 'cascade' }),
    assignedBy: uuid('assigned_by').references(() => users.id),
    assignedAt: timestamp('assigned_at').notNull().defaultNow(),
    permissions: text('permissions')
      .notNull()
      .default(
        '{"view_reports": true, "manage_passes": true, "manage_subscriptions": true}'
      ),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index('garage_admins_user_idx').on(table.userId),
    garageIdx: index('garage_admins_garage_idx').on(table.garageId),
    uniqueUserGarage: index('garage_admins_user_garage_unique').on(
      table.userId,
      table.garageId
    ),
  })
);

// Billing Tables
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    stripeSubscriptionId: varchar('stripe_subscription_id', {
      length: 255,
    }).unique(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    garageId: uuid('garage_id')
      .notNull()
      .references(() => garages.id, { onDelete: 'cascade' }),
    passId: uuid('pass_id')
      .notNull()
      .references(() => passes.id, { onDelete: 'cascade' }),
    stripePriceId: varchar('stripe_price_id', { length: 255 }),
    status: subscriptionStatusEnum('status').notNull(),
    currentPeriodStart: timestamp('current_period_start'),
    currentPeriodEnd: timestamp('current_period_end'),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false).notNull(),
    canceledAt: timestamp('canceled_at'),
    monthlyAmount: integer('monthly_amount').notNull(),
    // Renewal tracking fields
    renewalStatus: varchar('renewal_status', { length: 50 }).default('pending'),
    renewalAttemptedAt: timestamp('renewal_attempted_at'),
    nextRenewalDate: timestamp('next_renewal_date'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    garageIdx: index('subscriptions_garage_idx').on(table.garageId),
    userIdx: index('subscriptions_user_idx').on(table.userId),
    statusIdx: index('subscriptions_status_idx').on(table.status),
    stripeSubIdx: index('subscriptions_stripe_sub_idx').on(
      table.stripeSubscriptionId
    ),
  })
);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    stripePaymentIntentId: varchar('stripe_payment_intent_id', {
      length: 255,
    }).unique(),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
    garageId: uuid('garage_id')
      .notNull()
      .references(() => garages.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    stripeFee: integer('stripe_fee').notNull(),
    netAmount: integer('net_amount').notNull(),
    status: paymentStatusEnum('status').notNull(),
    currency: varchar('currency', { length: 3 }).default('usd').notNull(),
    paymentDate: timestamp('payment_date').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    garageIdx: index('payments_garage_idx').on(table.garageId),
    subscriptionIdx: index('payments_subscription_idx').on(
      table.subscriptionId
    ),
    statusIdx: index('payments_status_idx').on(table.status),
    paymentDateIdx: index('payments_payment_date_idx').on(table.paymentDate),
    stripePaymentIdx: index('payments_stripe_payment_idx').on(
      table.stripePaymentIntentId
    ),
  })
);

// Payment Methods Table
export const paymentMethods = pgTable(
  'payment_methods',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    stripePaymentMethodId: varchar('stripe_payment_method_id', {
      length: 255,
    })
      .notNull()
      .unique(),
    type: varchar('type', { length: 50 }).notNull(), // card, bank_account, etc.
    isDefault: boolean('is_default').default(false).notNull(),
    // Card-specific fields (populated for card payment methods)
    cardBrand: varchar('card_brand', { length: 50 }), // visa, mastercard, etc.
    cardLast4: varchar('card_last4', { length: 4 }),
    cardExpMonth: integer('card_exp_month'),
    cardExpYear: integer('card_exp_year'),
    // Additional metadata from Stripe
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    userIdx: index('payment_methods_user_idx').on(table.userId),
    stripePaymentMethodIdx: index('payment_methods_stripe_pm_idx').on(
      table.stripePaymentMethodId
    ),
    isDefaultIdx: index('payment_methods_is_default_idx').on(table.isDefault),
  })
);

// Webhook Events Table (for logging and idempotency)
export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    stripeEventId: varchar('stripe_event_id', { length: 255 })
      .notNull()
      .unique(),
    type: varchar('type', { length: 255 }).notNull(),
    status: webhookEventStatusEnum('status').notNull().default('pending'),
    payload: jsonb('payload').notNull(),
    processedAt: timestamp('processed_at'),
    errorMessage: text('error_message'),
    retryCount: integer('retry_count').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    stripeEventIdx: index('webhook_events_stripe_event_idx').on(
      table.stripeEventId
    ),
    typeIdx: index('webhook_events_type_idx').on(table.type),
    statusIdx: index('webhook_events_status_idx').on(table.status),
    createdAtIdx: index('webhook_events_created_at_idx').on(table.createdAt),
  })
);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  subscriptions: many(subscriptions),
  paymentMethods: many(paymentMethods),
}));

export const garagesRelations = relations(garages, ({ many }) => ({
  passes: many(passes),
  subscriptions: many(subscriptions),
  payments: many(payments),
  parked: many(parked),
  dailyOccupancy: many(garageDailyOccupancy),
}));

export const passesRelations = relations(passes, ({ one, many }) => ({
  garage: one(garages, {
    fields: [passes.garageId],
    references: [garages.id],
  }),
  subscriptions: many(subscriptions),
}));

// Type exports (must come after table definitions)
export type UserRole = 'user' | 'garage_admin' | 'super_admin';

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Garage = typeof garages.$inferSelect;
export type NewGarage = typeof garages.$inferInsert;

export type Parked = typeof parked.$inferSelect;
export type NewParked = typeof parked.$inferInsert;

export type GarageDailyOccupancy = typeof garageDailyOccupancy.$inferSelect;
export type NewGarageDailyOccupancy = typeof garageDailyOccupancy.$inferInsert;

export type GarageAdmin = typeof garageAdmins.$inferSelect;
export type NewGarageAdmin = typeof garageAdmins.$inferInsert;

export type Pass = typeof passes.$inferSelect;
export type NewPass = typeof passes.$inferInsert;

export type PassPriceHistory = typeof passPriceHistory.$inferSelect;
export type NewPassPriceHistory = typeof passPriceHistory.$inferInsert;

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;

export type PaymentMethod = typeof paymentMethods.$inferSelect;
export type NewPaymentMethod = typeof paymentMethods.$inferInsert;

export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type NewWebhookEvent = typeof webhookEvents.$inferInsert;

export const subscriptionsRelations = relations(
  subscriptions,
  ({ one, many }) => ({
    user: one(users, {
      fields: [subscriptions.userId],
      references: [users.id],
    }),
    garage: one(garages, {
      fields: [subscriptions.garageId],
      references: [garages.id],
    }),
    pass: one(passes, {
      fields: [subscriptions.passId],
      references: [passes.id],
    }),
    payments: many(payments),
  })
);

export const paymentsRelations = relations(payments, ({ one }) => ({
  subscription: one(subscriptions, {
    fields: [payments.subscriptionId],
    references: [subscriptions.id],
  }),
  garage: one(garages, {
    fields: [payments.garageId],
    references: [garages.id],
  }),
}));

export const paymentMethodsRelations = relations(paymentMethods, ({ one }) => ({
  user: one(users, {
    fields: [paymentMethods.userId],
    references: [users.id],
  }),
}));
