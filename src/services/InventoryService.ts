/**
 * Inventory Service
 * CRUD operations for inventory management and Stays.net reference data sync
 */

import { ObjectId } from 'mongodb';
import { getDb } from '../config/mongodb.js';
import { staysApiClient } from './stays/StaysApiClient.js';
import type {
  InventoryItemDoc,
  InventoryTransactionDoc,
  InventoryReferenceCategory,
  InventoryReferenceItem,
  InventoryReferenceCondition,
  CreateInventoryItemInput,
  UpdateInventoryItemInput,
  CreateTransactionInput,
} from './stays/types.js';

// Collection names
const COLLECTIONS = {
  ITEMS: 'inventory_items',
  TRANSACTIONS: 'inventory_transactions',
  REF_CATEGORIES: 'inventory_reference_categories',
  REF_ITEMS: 'inventory_reference_items',
  REF_CONDITIONS: 'inventory_reference_conditions',
} as const;

// ============ INVENTORY ITEMS CRUD ============

/**
 * Get all inventory items sorted by name
 */
export async function getAllItems(): Promise<InventoryItemDoc[]> {
  const db = getDb();
  const docs = await db.collection(COLLECTIONS.ITEMS)
    .find({})
    .sort({ name: 1 })
    .toArray();

  return docs.map(doc => ({
    ...doc,
    _id: doc._id.toString(),
    id: doc._id.toString(),
  })) as unknown as InventoryItemDoc[];
}

/**
 * Get a single inventory item by ID
 */
export async function getItemById(id: string): Promise<InventoryItemDoc | null> {
  const db = getDb();

  let objectId: ObjectId;
  try {
    objectId = new ObjectId(id);
  } catch {
    return null;
  }

  const doc = await db.collection(COLLECTIONS.ITEMS).findOne({ _id: objectId });

  if (!doc) return null;

  return {
    ...doc,
    _id: doc._id.toString(),
    id: doc._id.toString(),
  } as unknown as InventoryItemDoc;
}

/**
 * Create a new inventory item
 */
export async function createItem(input: CreateInventoryItemInput): Promise<InventoryItemDoc> {
  const db = getDb();
  const now = new Date();

  const doc = {
    name: input.name,
    brand: input.brand,
    model: input.model,
    dimensions: input.dimensions,
    description: input.description,
    category: input.category,
    minStock: input.minStock,
    stock: input.stock || { CENTRAL: 0 },
    staysReferenceItemId: input.staysReferenceItemId,
    staysReferenceCategoryId: input.staysReferenceCategoryId,
    createdAt: now,
    updatedAt: now,
  };

  const result = await db.collection(COLLECTIONS.ITEMS).insertOne(doc);

  return {
    ...doc,
    _id: result.insertedId.toString(),
    id: result.insertedId.toString(),
  } as unknown as InventoryItemDoc;
}

/**
 * Update an existing inventory item
 */
export async function updateItem(
  id: string,
  updates: UpdateInventoryItemInput
): Promise<InventoryItemDoc | null> {
  const db = getDb();

  let objectId: ObjectId;
  try {
    objectId = new ObjectId(id);
  } catch {
    return null;
  }

  // Remove undefined values from updates
  const cleanUpdates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      cleanUpdates[key] = value;
    }
  }

  const result = await db.collection(COLLECTIONS.ITEMS).findOneAndUpdate(
    { _id: objectId },
    { $set: { ...cleanUpdates, updatedAt: new Date() } },
    { returnDocument: 'after' }
  );

  if (!result) return null;

  return {
    ...result,
    _id: result._id.toString(),
    id: result._id.toString(),
  } as unknown as InventoryItemDoc;
}

/**
 * Delete an inventory item
 */
export async function deleteItem(id: string): Promise<boolean> {
  const db = getDb();

  let objectId: ObjectId;
  try {
    objectId = new ObjectId(id);
  } catch {
    return false;
  }

  const result = await db.collection(COLLECTIONS.ITEMS).deleteOne({ _id: objectId });
  return result.deletedCount > 0;
}

// ============ INVENTORY TRANSACTIONS ============

/**
 * Get all transactions with optional filters
 */
export async function getAllTransactions(options?: {
  itemId?: string;
  limit?: number;
  skip?: number;
}): Promise<InventoryTransactionDoc[]> {
  const db = getDb();
  const query: Record<string, unknown> = {};

  if (options?.itemId) {
    query.itemId = options.itemId;
  }

  let cursor = db.collection(COLLECTIONS.TRANSACTIONS)
    .find(query)
    .sort({ timestamp: -1 });

  if (options?.skip) {
    cursor = cursor.skip(options.skip);
  }

  if (options?.limit) {
    cursor = cursor.limit(options.limit);
  }

  const docs = await cursor.toArray();

  return docs.map(doc => ({
    ...doc,
    _id: doc._id.toString(),
    id: doc._id.toString(),
  })) as unknown as InventoryTransactionDoc[];
}

/**
 * Create a transaction (stock movement) with stock validation and update
 */
export async function createTransaction(
  input: CreateTransactionInput
): Promise<{ transaction: InventoryTransactionDoc; updatedItem: InventoryItemDoc }> {
  const db = getDb();
  const now = new Date();

  // 1. Get the item
  const item = await getItemById(input.itemId);
  if (!item) {
    throw new Error(`Item not found: ${input.itemId}`);
  }

  // 2. Validate stock availability (except for PURCHASE from VENDOR)
  if (input.source !== 'VENDOR') {
    const currentStock = item.stock[input.source] || 0;
    if (currentStock < input.quantity) {
      throw new Error(
        `Insufficient stock in ${input.source}. Available: ${currentStock}, Requested: ${input.quantity}`
      );
    }
  }

  // 3. Calculate new stock
  const newStock = { ...item.stock };

  // Remove from source (if not vendor)
  if (input.source !== 'VENDOR') {
    newStock[input.source] = Math.max(0, (newStock[input.source] || 0) - input.quantity);
    // Clean up zero values to keep stock object clean
    if (newStock[input.source] === 0 && input.source !== 'CENTRAL') {
      delete newStock[input.source];
    }
  }

  // Add to destination (if not trash)
  if (input.destination !== 'TRASH') {
    newStock[input.destination] = (newStock[input.destination] || 0) + input.quantity;
  }

  // 4. Create transaction document
  const txDoc = {
    itemId: input.itemId,
    itemName: item.name,
    type: input.type,
    quantity: input.quantity,
    source: input.source,
    destination: input.destination,
    user: input.user,
    notes: input.notes,
    timestamp: now,
    createdAt: now,
  };

  // 5. Insert transaction and update item stock
  const [txResult] = await Promise.all([
    db.collection(COLLECTIONS.TRANSACTIONS).insertOne(txDoc),
    db.collection(COLLECTIONS.ITEMS).updateOne(
      { _id: new ObjectId(input.itemId) },
      { $set: { stock: newStock, updatedAt: now } }
    ),
  ]);

  const transaction: InventoryTransactionDoc = {
    ...txDoc,
    _id: txResult.insertedId.toString(),
    id: txResult.insertedId.toString(),
  } as unknown as InventoryTransactionDoc;

  const updatedItem: InventoryItemDoc = {
    ...item,
    stock: newStock,
    updatedAt: now,
  };

  return { transaction, updatedItem };
}

// ============ REFERENCE DATA SYNC ============

/**
 * Sync reference data from Stays.net
 */
export async function syncReferenceData(): Promise<{
  categories: number;
  items: number;
  conditions: number;
}> {
  const db = getDb();
  const now = new Date();

  console.log('📥 Syncing inventory reference data from Stays.net...');

  // Fetch from Stays.net API in parallel
  const [categories, items, conditions] = await Promise.all([
    staysApiClient.getInventoryCategories(),
    staysApiClient.getInventoryItems(),
    staysApiClient.getInventoryConditions(),
  ]);

  console.log(`  Found: ${categories.length} categories, ${items.length} items, ${conditions.length} conditions`);

  let catCount = 0;
  let itemCount = 0;
  let condCount = 0;

  // Upsert categories
  if (categories.length > 0) {
    const catOps = categories.map(cat => ({
      updateOne: {
        filter: { staysCategoryId: cat._id },
        update: {
          $set: {
            staysCategoryId: cat._id,
            titles: cat._mstitle,
            titlePtBr: cat._mstitle?.pt_BR || cat._mstitle?.en_US || '',
            syncedAt: now,
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now },
        },
        upsert: true,
      },
    }));

    const catResult = await db.collection(COLLECTIONS.REF_CATEGORIES).bulkWrite(catOps);
    catCount = (catResult.upsertedCount || 0) + (catResult.modifiedCount || 0);
  }

  // Upsert items
  if (items.length > 0) {
    const itemOps = items.map(item => ({
      updateOne: {
        filter: { staysItemId: item._id },
        update: {
          $set: {
            staysItemId: item._id,
            titles: item._mstitle,
            titlePtBr: item._mstitle?.pt_BR || item._mstitle?.en_US || '',
            categoryId: item.categoryId,
            syncedAt: now,
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now },
        },
        upsert: true,
      },
    }));

    const itemResult = await db.collection(COLLECTIONS.REF_ITEMS).bulkWrite(itemOps);
    itemCount = (itemResult.upsertedCount || 0) + (itemResult.modifiedCount || 0);
  }

  // Upsert conditions
  if (conditions.length > 0) {
    const condOps = conditions.map(cond => ({
      updateOne: {
        filter: { staysConditionId: cond._id },
        update: {
          $set: {
            staysConditionId: cond._id,
            titles: cond._mstitle,
            titlePtBr: cond._mstitle?.pt_BR || cond._mstitle?.en_US || '',
            syncedAt: now,
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now },
        },
        upsert: true,
      },
    }));

    const condResult = await db.collection(COLLECTIONS.REF_CONDITIONS).bulkWrite(condOps);
    condCount = (condResult.upsertedCount || 0) + (condResult.modifiedCount || 0);
  }

  console.log(`✅ Reference sync complete: ${catCount} categories, ${itemCount} items, ${condCount} conditions`);

  return {
    categories: catCount,
    items: itemCount,
    conditions: condCount,
  };
}

/**
 * Get all reference categories
 */
export async function getReferenceCategories(): Promise<InventoryReferenceCategory[]> {
  const db = getDb();
  const docs = await db.collection(COLLECTIONS.REF_CATEGORIES).find({}).toArray();
  return docs.map(doc => ({
    ...doc,
    _id: doc._id.toString(),
  })) as unknown as InventoryReferenceCategory[];
}

/**
 * Get all reference items
 */
export async function getReferenceItems(): Promise<InventoryReferenceItem[]> {
  const db = getDb();
  const docs = await db.collection(COLLECTIONS.REF_ITEMS).find({}).toArray();
  return docs.map(doc => ({
    ...doc,
    _id: doc._id.toString(),
  })) as unknown as InventoryReferenceItem[];
}

/**
 * Get all reference conditions
 */
export async function getReferenceConditions(): Promise<InventoryReferenceCondition[]> {
  const db = getDb();
  const docs = await db.collection(COLLECTIONS.REF_CONDITIONS).find({}).toArray();
  return docs.map(doc => ({
    ...doc,
    _id: doc._id.toString(),
  })) as unknown as InventoryReferenceCondition[];
}

// ============ INDEX CREATION ============

/**
 * Create indexes for inventory collections
 * Should be called during MongoDB connection setup
 */
export async function createInventoryIndexes(): Promise<void> {
  const db = getDb();

  try {
    // inventory_items indexes
    await db.collection(COLLECTIONS.ITEMS).createIndex(
      { name: 1 },
      { background: true }
    );
    await db.collection(COLLECTIONS.ITEMS).createIndex(
      { category: 1 },
      { background: true }
    );
    await db.collection(COLLECTIONS.ITEMS).createIndex(
      { updatedAt: -1 },
      { background: true }
    );

    // inventory_transactions indexes
    await db.collection(COLLECTIONS.TRANSACTIONS).createIndex(
      { itemId: 1, timestamp: -1 },
      { background: true }
    );
    await db.collection(COLLECTIONS.TRANSACTIONS).createIndex(
      { timestamp: -1 },
      { background: true }
    );
    await db.collection(COLLECTIONS.TRANSACTIONS).createIndex(
      { user: 1 },
      { background: true }
    );

    // Reference collections indexes
    await db.collection(COLLECTIONS.REF_CATEGORIES).createIndex(
      { staysCategoryId: 1 },
      { unique: true, background: true }
    );
    await db.collection(COLLECTIONS.REF_ITEMS).createIndex(
      { staysItemId: 1 },
      { unique: true, background: true }
    );
    await db.collection(COLLECTIONS.REF_CONDITIONS).createIndex(
      { staysConditionId: 1 },
      { unique: true, background: true }
    );

    console.log('📇 Inventory indexes created');
  } catch (error) {
    console.log('📇 Inventory indexes already exist or creation skipped');
  }
}
