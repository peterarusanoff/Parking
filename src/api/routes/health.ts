import { Elysia } from 'elysia';

import { successResponse } from '@/shared/index';

export const healthRoutes = new Elysia({ prefix: '' })
  .get(
    '/health',
    () =>
      successResponse({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      }),
    {
      detail: {
        tags: ['health'],
        summary: 'Health check',
        description: 'Returns the health status of the API',
      },
    }
  );

