/**
 * Route Registration
 */

import type { FastifyInstance } from 'fastify';
import { healthRoutes } from './health.js';
import { syncRoutes } from './sync.js';
import { dashboardRoutes } from './dashboard.js';
import { calendarRoutes } from './calendar.js';

export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  // Health routes (no prefix, no auth)
  await fastify.register(healthRoutes);

  // API v1 routes (with prefix and auth)
  await fastify.register(
    async (api) => {
      await api.register(syncRoutes);
      await api.register(dashboardRoutes);
      await api.register(calendarRoutes);
    },
    { prefix: '/api/v1' }
  );
}
