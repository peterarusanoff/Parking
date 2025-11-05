import { eq } from 'drizzle-orm';

import { db, users } from '@/database/index';
import type { NewUser } from '@/database/schema';
import type { Result } from '@/shared/index';

import { stripe } from './stripe-client';

export interface CreateUserParams {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
}

/**
 * Create a new user with Stripe customer
 * This ensures every user has a Stripe customer ID for billing
 */
export async function createUser(
  params: CreateUserParams
): Promise<Result<typeof users.$inferSelect>> {
  try {
    // First, create the Stripe customer
    const stripeCustomer = await stripe.customers.create({
      email: params.email,
      name: `${params.firstName} ${params.lastName}`,
      ...(params.phone && { phone: params.phone }),
      metadata: {
        firstName: params.firstName,
        lastName: params.lastName,
      },
    });

    // Then create the user in our database with the Stripe customer ID
    const newUserData: NewUser = {
      firstName: params.firstName,
      lastName: params.lastName,
      email: params.email,
      ...(params.phone && { phone: params.phone }),
      stripeCustomerId: stripeCustomer.id,
    };

    const [user] = await db.insert(users).values(newUserData).returning();

    if (!user) {
      throw new Error('Failed to create user in database');
    }

    return {
      success: true,
      data: user,
    };
  } catch (error) {
    console.error('Error creating user:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to create user';
    return {
      success: false,
      error: new Error(errorMessage),
    };
  }
}

/**
 * Update user and sync with Stripe
 */
export async function updateUser(
  userId: string,
  params: Partial<CreateUserParams>
): Promise<Result<typeof users.$inferSelect>> {
  try {
    // Get the existing user to get their Stripe customer ID
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!existingUser) {
      return {
        success: false,
        error: new Error('User not found'),
      };
    }

    // Update Stripe customer if they have one
    if (existingUser.stripeCustomerId) {
      const updateData: Record<string, unknown> = {};
      
      if (params.email) {
        updateData['email'] = params.email;
      }
      
      if (params.firstName || params.lastName) {
        updateData['name'] = `${params.firstName || existingUser.firstName} ${params.lastName || existingUser.lastName}`;
      }
      
      if (params.phone !== undefined) {
        updateData['phone'] = params.phone || '';
      }

      await stripe.customers.update(existingUser.stripeCustomerId, updateData);
    }

    // Update user in database
    const updateData: Record<string, unknown> = {};
    if (params.firstName !== undefined) updateData['firstName'] = params.firstName;
    if (params.lastName !== undefined) updateData['lastName'] = params.lastName;
    if (params.email !== undefined) updateData['email'] = params.email;
    if (params.phone !== undefined) updateData['phone'] = params.phone;

    const [updatedUser] = await db
      .update(users)
      .set(updateData as any)
      .where(eq(users.id, userId))
      .returning();

    if (!updatedUser) {
      throw new Error('Failed to update user in database');
    }

    return {
      success: true,
      data: updatedUser,
    };
  } catch (error) {
    console.error('Error updating user:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to update user';
    return {
      success: false,
      error: new Error(errorMessage),
    };
  }
}

