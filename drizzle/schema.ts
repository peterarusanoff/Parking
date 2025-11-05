import { pgTable, index, foreignKey, unique, uuid, varchar, timestamp, boolean, numeric, text, jsonb, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const paymentStatus = pgEnum("payment_status", ['succeeded', 'failed', 'processing', 'canceled'])
export const renewalStatus = pgEnum("renewal_status", ['pending', 'processing', 'completed', 'failed'])
export const subscriptionStatus = pgEnum("subscription_status", ['active', 'past_due', 'canceled', 'unpaid', 'trialing'])
export const userRole = pgEnum("user_role", ['user', 'garage_admin', 'super_admin'])


export const subscriptions = pgTable("subscriptions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
	userId: uuid("user_id").notNull(),
	garageId: uuid("garage_id").notNull(),
	passId: uuid("pass_id").notNull(),
	stripePriceId: varchar("stripe_price_id", { length: 255 }),
	status: subscriptionStatus().notNull(),
	currentPeriodStart: timestamp("current_period_start", { mode: 'string' }),
	currentPeriodEnd: timestamp("current_period_end", { mode: 'string' }),
	cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
	canceledAt: timestamp("canceled_at", { mode: 'string' }),
	monthlyAmount: numeric("monthly_amount", { precision: 10, scale:  2 }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	renewalStatus: renewalStatus("renewal_status").default('pending'),
	renewalAttemptedAt: timestamp("renewal_attempted_at", { mode: 'string' }),
	nextRenewalDate: timestamp("next_renewal_date", { mode: 'string' }),
}, (table) => {
	return {
		garageIdx: index("subscriptions_garage_idx").using("btree", table.garageId.asc().nullsLast().op("uuid_ops")),
		nextRenewalDateIdx: index("subscriptions_next_renewal_date_idx").using("btree", table.nextRenewalDate.asc().nullsLast().op("timestamp_ops")),
		renewalStatusIdx: index("subscriptions_renewal_status_idx").using("btree", table.renewalStatus.asc().nullsLast().op("enum_ops")),
		statusIdx: index("subscriptions_status_idx").using("btree", table.status.asc().nullsLast().op("enum_ops")),
		stripeSubIdx: index("subscriptions_stripe_sub_idx").using("btree", table.stripeSubscriptionId.asc().nullsLast().op("text_ops")),
		userIdx: index("subscriptions_user_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
		subscriptionsUserIdUsersIdFk: foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "subscriptions_user_id_users_id_fk"
		}).onDelete("cascade"),
		subscriptionsGarageIdGaragesIdFk: foreignKey({
			columns: [table.garageId],
			foreignColumns: [garages.id],
			name: "subscriptions_garage_id_garages_id_fk"
		}).onDelete("cascade"),
		subscriptionsPassIdPassesIdFk: foreignKey({
			columns: [table.passId],
			foreignColumns: [passes.id],
			name: "subscriptions_pass_id_passes_id_fk"
		}).onDelete("cascade"),
		subscriptionsStripeSubscriptionIdUnique: unique("subscriptions_stripe_subscription_id_unique").on(table.stripeSubscriptionId),
	}
});

export const garages = pgTable("garages", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: varchar({ length: 255 }).notNull(),
	address: varchar({ length: 500 }).notNull(),
	stripeAccountId: varchar("stripe_account_id", { length: 255 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => {
	return {
		stripeAccountIdx: index("garages_stripe_account_idx").using("btree", table.stripeAccountId.asc().nullsLast().op("text_ops")),
	}
});

export const passes = pgTable("passes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	garageId: uuid("garage_id").notNull(),
	name: varchar({ length: 255 }).notNull(),
	description: varchar({ length: 1000 }),
	stripeProductId: varchar("stripe_product_id", { length: 255 }),
	stripePriceId: varchar("stripe_price_id", { length: 255 }),
	monthlyAmount: numeric("monthly_amount", { precision: 10, scale:  2 }).notNull(),
	active: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => {
	return {
		activeIdx: index("passes_active_idx").using("btree", table.active.asc().nullsLast().op("bool_ops")),
		garageIdx: index("passes_garage_idx").using("btree", table.garageId.asc().nullsLast().op("uuid_ops")),
		stripeProductIdx: index("passes_stripe_product_idx").using("btree", table.stripeProductId.asc().nullsLast().op("text_ops")),
		passesGarageIdGaragesIdFk: foreignKey({
			columns: [table.garageId],
			foreignColumns: [garages.id],
			name: "passes_garage_id_garages_id_fk"
		}).onDelete("cascade"),
	}
});

export const users = pgTable("users", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	firstName: varchar("first_name", { length: 255 }).notNull(),
	lastName: varchar("last_name", { length: 255 }).notNull(),
	email: varchar({ length: 255 }).notNull(),
	phone: varchar({ length: 50 }),
	stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	role: userRole().default('user').notNull(),
}, (table) => {
	return {
		emailIdx: index("users_email_idx").using("btree", table.email.asc().nullsLast().op("text_ops")),
		roleIdx: index("users_role_idx").using("btree", table.role.asc().nullsLast().op("enum_ops")),
		stripeCustomerIdx: index("users_stripe_customer_idx").using("btree", table.stripeCustomerId.asc().nullsLast().op("text_ops")),
		usersEmailUnique: unique("users_email_unique").on(table.email),
	}
});

export const payments = pgTable("payments", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
	subscriptionId: uuid("subscription_id").notNull(),
	garageId: uuid("garage_id").notNull(),
	amount: numeric({ precision: 10, scale:  2 }).notNull(),
	stripeFee: numeric("stripe_fee", { precision: 10, scale:  2 }).notNull(),
	netAmount: numeric("net_amount", { precision: 10, scale:  2 }).notNull(),
	status: paymentStatus().notNull(),
	currency: varchar({ length: 3 }).default('usd').notNull(),
	paymentDate: timestamp("payment_date", { mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => {
	return {
		garageIdx: index("payments_garage_idx").using("btree", table.garageId.asc().nullsLast().op("uuid_ops")),
		paymentDateIdx: index("payments_payment_date_idx").using("btree", table.paymentDate.asc().nullsLast().op("timestamp_ops")),
		statusIdx: index("payments_status_idx").using("btree", table.status.asc().nullsLast().op("enum_ops")),
		stripePaymentIdx: index("payments_stripe_payment_idx").using("btree", table.stripePaymentIntentId.asc().nullsLast().op("text_ops")),
		subscriptionIdx: index("payments_subscription_idx").using("btree", table.subscriptionId.asc().nullsLast().op("uuid_ops")),
		paymentsSubscriptionIdSubscriptionsIdFk: foreignKey({
			columns: [table.subscriptionId],
			foreignColumns: [subscriptions.id],
			name: "payments_subscription_id_subscriptions_id_fk"
		}).onDelete("cascade"),
		paymentsGarageIdGaragesIdFk: foreignKey({
			columns: [table.garageId],
			foreignColumns: [garages.id],
			name: "payments_garage_id_garages_id_fk"
		}).onDelete("cascade"),
		paymentsStripePaymentIntentIdUnique: unique("payments_stripe_payment_intent_id_unique").on(table.stripePaymentIntentId),
	}
});

export const passPriceHistory = pgTable("pass_price_history", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	passId: uuid("pass_id").notNull(),
	oldPrice: numeric("old_price", { precision: 10, scale:  2 }),
	newPrice: numeric("new_price", { precision: 10, scale:  2 }).notNull(),
	oldStripePriceId: varchar("old_stripe_price_id", { length: 255 }),
	newStripePriceId: varchar("new_stripe_price_id", { length: 255 }),
	changedBy: varchar("changed_by", { length: 255 }),
	changeReason: text("change_reason"),
	effectiveDate: timestamp("effective_date", { mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => {
	return {
		effectiveDateIdx: index("pass_price_history_effective_date_idx").using("btree", table.effectiveDate.asc().nullsLast().op("timestamp_ops")),
		passIdx: index("pass_price_history_pass_idx").using("btree", table.passId.asc().nullsLast().op("uuid_ops")),
		passPriceHistoryPassIdFkey: foreignKey({
			columns: [table.passId],
			foreignColumns: [passes.id],
			name: "pass_price_history_pass_id_fkey"
		}).onDelete("cascade"),
	}
});

export const garageAdmins = pgTable("garage_admins", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	garageId: uuid("garage_id").notNull(),
	assignedBy: uuid("assigned_by"),
	assignedAt: timestamp("assigned_at", { mode: 'string' }).defaultNow().notNull(),
	permissions: jsonb().default({"view_reports":true,"manage_passes":true,"manage_subscriptions":true}),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => {
	return {
		garageIdx: index("garage_admins_garage_idx").using("btree", table.garageId.asc().nullsLast().op("uuid_ops")),
		userIdx: index("garage_admins_user_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
		garageAdminsUserIdFkey: foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "garage_admins_user_id_fkey"
		}).onDelete("cascade"),
		garageAdminsGarageIdFkey: foreignKey({
			columns: [table.garageId],
			foreignColumns: [garages.id],
			name: "garage_admins_garage_id_fkey"
		}).onDelete("cascade"),
		garageAdminsAssignedByFkey: foreignKey({
			columns: [table.assignedBy],
			foreignColumns: [users.id],
			name: "garage_admins_assigned_by_fkey"
		}),
		garageAdminsUserIdGarageIdKey: unique("garage_admins_user_id_garage_id_key").on(table.userId, table.garageId),
	}
});
