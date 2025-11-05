import { relations } from "drizzle-orm/relations";
import { users, subscriptions, garages, passes, payments, passPriceHistory, garageAdmins } from "./schema";

export const subscriptionsRelations = relations(subscriptions, ({one, many}) => ({
	user: one(users, {
		fields: [subscriptions.userId],
		references: [users.id]
	}),
	garage: one(garages, {
		fields: [subscriptions.garageId],
		references: [garages.id]
	}),
	pass: one(passes, {
		fields: [subscriptions.passId],
		references: [passes.id]
	}),
	payments: many(payments),
}));

export const usersRelations = relations(users, ({many}) => ({
	subscriptions: many(subscriptions),
	garageAdmins_userId: many(garageAdmins, {
		relationName: "garageAdmins_userId_users_id"
	}),
	garageAdmins_assignedBy: many(garageAdmins, {
		relationName: "garageAdmins_assignedBy_users_id"
	}),
}));

export const garagesRelations = relations(garages, ({many}) => ({
	subscriptions: many(subscriptions),
	passes: many(passes),
	payments: many(payments),
	garageAdmins: many(garageAdmins),
}));

export const passesRelations = relations(passes, ({one, many}) => ({
	subscriptions: many(subscriptions),
	garage: one(garages, {
		fields: [passes.garageId],
		references: [garages.id]
	}),
	passPriceHistories: many(passPriceHistory),
}));

export const paymentsRelations = relations(payments, ({one}) => ({
	subscription: one(subscriptions, {
		fields: [payments.subscriptionId],
		references: [subscriptions.id]
	}),
	garage: one(garages, {
		fields: [payments.garageId],
		references: [garages.id]
	}),
}));

export const passPriceHistoryRelations = relations(passPriceHistory, ({one}) => ({
	pass: one(passes, {
		fields: [passPriceHistory.passId],
		references: [passes.id]
	}),
}));

export const garageAdminsRelations = relations(garageAdmins, ({one}) => ({
	user_userId: one(users, {
		fields: [garageAdmins.userId],
		references: [users.id],
		relationName: "garageAdmins_userId_users_id"
	}),
	garage: one(garages, {
		fields: [garageAdmins.garageId],
		references: [garages.id]
	}),
	user_assignedBy: one(users, {
		fields: [garageAdmins.assignedBy],
		references: [users.id],
		relationName: "garageAdmins_assignedBy_users_id"
	}),
}));