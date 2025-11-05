import { z } from 'zod';

/**
 * Environment variable schema with Zod validation
 * Provides type-safe access to environment variables across the application
 */
const envSchema = z.object({
  // Node Environment
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  // API Configuration
  PORT: z.coerce.number().default(3000),

  // Database Configuration
  DATABASE_URL: z
    .string()
    .url()
    .default('postgresql://vend:vend_dev_pass@localhost:5432/vend_assessment'),

  // Stripe Configuration (Test Mode)
  STRIPE_SECRET_KEY: z.string().min(1, 'Stripe secret key is required'),
  STRIPE_PUBLISHABLE_KEY: z
    .string()
    .min(1, 'Stripe publishable key is required')
    .optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // Optional: CORS Configuration
  CORS_ORIGIN: z.string().optional(),

  // Optional: Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

/**
 * Parse and validate environment variables
 * Throws an error if validation fails
 */
function parseEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('❌ Invalid environment variables:');
    console.error(JSON.stringify(parsed.error.format(), null, 2));
    throw new Error('Invalid environment variables');
  }

  return parsed.data;
}

/**
 * Validated and type-safe environment variables
 * Use this instead of process.env throughout the application
 *
 * @example
 * import { env } from '@/env';
 * console.log(env.PORT); // Type-safe!
 */
export const env = parseEnv();

/**
 * Type of the environment variables
 * Useful for type annotations
 */
export type Env = z.infer<typeof envSchema>;

/**
 * Check if running in production
 */
export const isProduction = env.NODE_ENV === 'production';

/**
 * Check if running in development
 */
export const isDevelopment = env.NODE_ENV === 'development';

/**
 * Check if running in test
 */
export const isTest = env.NODE_ENV === 'test';

