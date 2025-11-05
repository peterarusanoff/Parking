import { relations } from 'drizzle-orm';
import {
  boolean,
  decimal,
  index,
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
    monthlyAmount: decimal('monthly_amount', { precision: 10, scale: 2 }).notNull(),
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
    oldPrice: decimal('old_price', { precision: 10, scale: 2 }),
    newPrice: decimal('new_price', { precision: 10, scale: 2 }).notNull(),
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
    permissions: text('permissions').notNull().default(
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
    monthlyAmount: decimal('monthly_amount', { precision: 10, scale: 2 }).notNull(),
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
    amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
    stripeFee: decimal('stripe_fee', { precision: 10, scale: 2 }).notNull(),
    netAmount: decimal('net_amount', { precision: 10, scale: 2 }).notNull(),
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

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  subscriptions: many(subscriptions),
}));

export const garagesRelations = relations(garages, ({ many }) => ({
  passes: many(passes),
  subscriptions: many(subscriptions),
  payments: many(payments),
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

