/**
 * Inventory Routes
 * CRUD operations for inventory items and transactions
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { validateApiKey } from '../middleware/auth.js';
import * as InventoryService from '../services/InventoryService.js';
import type {
  CreateInventoryItemInput,
  UpdateInventoryItemInput,
  CreateTransactionInput,
} from '../services/stays/types.js';

// Request type definitions
interface ItemParams {
  id: string;
}

interface TransactionQuery {
  itemId?: string;
  limit?: string;
  skip?: string;
}

export async function inventoryRoutes(fastify: FastifyInstance): Promise<void> {
  // Add auth hook to all routes in this plugin
  fastify.addHook('preHandler', validateApiKey);

  // ============ INVENTORY ITEMS CRUD ============

  /**
   * GET /api/v1/inventory/items
   * List all inventory items
   */
  fastify.get('/inventory/items', async () => {
    const items = await InventoryService.getAllItems();
    return { items };
  });

  /**
   * GET /api/v1/inventory/items/:id
   * Get a single inventory item
   */
  fastify.get<{ Params: ItemParams }>(
    '/inventory/items/:id',
    async (request: FastifyRequest<{ Params: ItemParams }>, reply: FastifyReply) => {
      const item = await InventoryService.getItemById(request.params.id);

      if (!item) {
        return reply.code(404).send({
          error: 'Not Found',
          message: `Item not found: ${request.params.id}`,
        });
      }

      return { item };
    }
  );

  /**
   * POST /api/v1/inventory/items
   * Create a new inventory item
   */
  fastify.post<{ Body: CreateInventoryItemInput }>(
    '/inventory/items',
    async (request: FastifyRequest<{ Body: CreateInventoryItemInput }>, reply: FastifyReply) => {
      const body = request.body;

      // Basic validation
      if (!body.name || !body.category) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Missing required fields: name, category',
        });
      }

      const item = await InventoryService.createItem(body);
      return reply.code(201).send({ item });
    }
  );

  /**
   * PUT /api/v1/inventory/items/:id
   * Update an existing inventory item
   */
  fastify.put<{ Params: ItemParams; Body: UpdateInventoryItemInput }>(
    '/inventory/items/:id',
    async (
      request: FastifyRequest<{ Params: ItemParams; Body: UpdateInventoryItemInput }>,
      reply: FastifyReply
    ) => {
      const item = await InventoryService.updateItem(request.params.id, request.body);

      if (!item) {
        return reply.code(404).send({
          error: 'Not Found',
          message: `Item not found: ${request.params.id}`,
        });
      }

      return { item };
    }
  );

  /**
   * DELETE /api/v1/inventory/items/:id
   * Delete an inventory item
   */
  fastify.delete<{ Params: ItemParams }>(
    '/inventory/items/:id',
    async (request: FastifyRequest<{ Params: ItemParams }>, reply: FastifyReply) => {
      const deleted = await InventoryService.deleteItem(request.params.id);

      if (!deleted) {
        return reply.code(404).send({
          error: 'Not Found',
          message: `Item not found: ${request.params.id}`,
        });
      }

      return { success: true };
    }
  );

  // ============ INVENTORY TRANSACTIONS ============

  /**
   * GET /api/v1/inventory/transactions
   * List transactions with optional filters
   */
  fastify.get<{ Querystring: TransactionQuery }>(
    '/inventory/transactions',
    async (request: FastifyRequest<{ Querystring: TransactionQuery }>) => {
      const { itemId, limit, skip } = request.query;

      const transactions = await InventoryService.getAllTransactions({
        itemId,
        limit: limit ? parseInt(limit, 10) : undefined,
        skip: skip ? parseInt(skip, 10) : undefined,
      });

      return { transactions };
    }
  );

  /**
   * POST /api/v1/inventory/transactions
   * Create a transaction (stock movement)
   */
  fastify.post<{ Body: CreateTransactionInput }>(
    '/inventory/transactions',
    async (
      request: FastifyRequest<{ Body: CreateTransactionInput }>,
      reply: FastifyReply
    ) => {
      const body = request.body;

      // Basic validation
      if (!body.itemId || !body.type || !body.quantity || !body.source || !body.destination || !body.user) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Missing required fields: itemId, type, quantity, source, destination, user',
        });
      }

      if (body.quantity <= 0) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Quantity must be greater than 0',
        });
      }

      try {
        const result = await InventoryService.createTransaction(body);
        return reply.code(201).send(result);
      } catch (error) {
        const err = error as Error;

        // Handle known errors
        if (err.message.includes('not found')) {
          return reply.code(404).send({
            error: 'Not Found',
            message: err.message,
          });
        }

        if (err.message.includes('Insufficient stock')) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: err.message,
          });
        }

        // Re-throw unknown errors
        throw error;
      }
    }
  );

  // ============ REFERENCE DATA ============

  /**
   * GET /api/v1/inventory/reference/categories
   * Get all reference categories (from Stays.net sync)
   */
  fastify.get('/inventory/reference/categories', async () => {
    const categories = await InventoryService.getReferenceCategories();
    return { categories };
  });

  /**
   * GET /api/v1/inventory/reference/items
   * Get all reference items (from Stays.net sync)
   */
  fastify.get('/inventory/reference/items', async () => {
    const items = await InventoryService.getReferenceItems();
    return { items };
  });

  /**
   * GET /api/v1/inventory/reference/conditions
   * Get all reference conditions (from Stays.net sync)
   */
  fastify.get('/inventory/reference/conditions', async () => {
    const conditions = await InventoryService.getReferenceConditions();
    return { conditions };
  });

  /**
   * POST /api/v1/inventory/reference/sync
   * Trigger reference data sync from Stays.net
   */
  fastify.post('/inventory/reference/sync', async () => {
    const result = await InventoryService.syncReferenceData();

    return {
      success: true,
      synced: result,
      timestamp: new Date().toISOString(),
    };
  });
}
