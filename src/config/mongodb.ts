/**
 * MongoDB Configuration
 * Connects to MongoDB Atlas for booking data storage
 */

import { MongoClient, Db } from 'mongodb';
import { config } from './env.js';

let client: MongoClient | null = null;
let db: Db | null = null;

/**
 * Connects to MongoDB Atlas
 */
export async function connectMongoDB(): Promise<Db> {
  if (db) return db;

  client = new MongoClient(config.mongodb.uri, {
    // Connection pool settings for performance
    minPoolSize: 5,           // Keep 5 connections warm
    maxPoolSize: 20,          // Max connections
    maxIdleTimeMS: 30000,     // Close idle connections after 30s

    // Timeout settings for faster failure detection
    serverSelectionTimeoutMS: 5000,  // Fail fast if no server
    socketTimeoutMS: 30000,          // 30s socket timeout
    connectTimeoutMS: 10000,         // 10s connection timeout

    // Keep-alive for MongoDB Atlas
    heartbeatFrequencyMS: 10000,     // Check connection every 10s

    // Compression for faster data transfer
    compressors: ['snappy', 'zlib'],
  });
  await client.connect();
  db = client.db(config.mongodb.dbName);

  console.log('🍃 MongoDB connected to database:', config.mongodb.dbName);

  // Create indexes for optimized queries
  await createIndexes();

  return db;
}

/**
 * Creates indexes for optimized queries
 */
async function createIndexes(): Promise<void> {
  if (!db) return;

  try {
    // Index for unified_bookings - optimizes date range queries
    await db.collection('stays_unified_bookings').createIndex(
      { checkOutDate: 1, checkInDate: 1 },
      { background: true }
    );

    // Index for reservations - optimizes date range queries
    await db.collection('stays_reservations').createIndex(
      { checkOutDate: 1, checkInDate: 1 },
      { background: true }
    );

    console.log('📇 MongoDB indexes created');
  } catch (error) {
    // Indexes might already exist, which is fine
    console.log('📇 MongoDB indexes already exist or creation skipped');
  }
}

/**
 * Gets the database instance
 */
export function getDb(): Db {
  if (!db) {
    throw new Error('MongoDB not connected. Call connectMongoDB() first.');
  }
  return db;
}

/**
 * Collection references with type safety
 */
export function getCollections() {
  const database = getDb();
  return {
    listings: database.collection('stays_listings'),
    reservations: database.collection('stays_reservations'),
    unifiedBookings: database.collection('stays_unified_bookings'),
    syncStatus: database.collection('stays_sync_status'),
  };
}

/**
 * Closes the MongoDB connection
 */
export async function closeMongoDB(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log('🍃 MongoDB connection closed');
  }
}
