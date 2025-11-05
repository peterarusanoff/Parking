import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';
import { Elysia } from 'elysia';

import { env, isDevelopment } from '@/env';
import { errorResponse } from '@/shared/index';

import {
  adminRoutes,
  billingRoutes,
  garageRoutes,
  healthRoutes,
  parkedRoutes,
  passRoutes,
  subscriptionRoutes,
  userRoutes,
} from './routes';

/**
 * Main Elysia application with OpenAPI documentation
 * Configured with full type safety and request/response validation
 */
const app = new Elysia()
  // Add Swagger documentation
  .use(
    swagger({
      documentation: {
        info: {
          title: 'Vend Parking API',
          version: '1.0.0',
          description:
            'Type-safe billing and reporting API for parking subscriptions',
        },
        tags: [
          { name: 'health', description: 'Health check endpoints' },
          { name: 'admin', description: 'Garage admin endpoints (RBAC)' },
          { name: 'parked', description: 'Parked vehicle logs' },
          { name: 'users', description: 'User management' },
          { name: 'garages', description: 'Garage management and analytics' },
          { name: 'passes', description: 'Pass management' },
          { name: 'subscriptions', description: 'Subscription management' },
          { name: 'billing', description: 'Billing operations' },
        ],
      },
    })
  )
  // Add CORS support
  .use(
    cors({
      origin: isDevelopment ? '*' : /\.vend\.com$/,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      credentials: true,
    })
  )
  // Global error handler
  .onError(({ code, error, set }) => {
    console.error('Error:', error);

    if (code === 'VALIDATION') {
      set.status = 400;
      return errorResponse(
        'Validation error: ' +
          (error instanceof Error ? error.message : String(error))
      );
    }

    if (code === 'NOT_FOUND') {
      set.status = 404;
      return errorResponse('Route not found');
    }

    set.status = 500;
    const message =
      error instanceof Error ? error.message : 'Internal server error';
    return errorResponse(isDevelopment ? message : 'Internal server error');
  })
  // Register all route modules
  .use(healthRoutes)
  .use(adminRoutes)
  .use(parkedRoutes)
  .use(userRoutes)
  .use(garageRoutes)
  .use(passRoutes)
  .use(subscriptionRoutes)
  .use(billingRoutes)
  // Start server
  .listen(env.PORT);

console.log(`
🦊 Vend Parking API is running!
  
  📍 Server:       http://localhost:${app.server?.port}
  📚 Swagger:      http://localhost:${app.server?.port}/swagger
  🏥 Health:       http://localhost:${app.server?.port}/health
  
  Environment:     ${env.NODE_ENV}
  Process ID:      ${process.pid}
`);

export type App = typeof app;
