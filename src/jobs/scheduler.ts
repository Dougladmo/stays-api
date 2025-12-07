/**
 * Cron Job Scheduler
 * Handles periodic sync from Stays.net API to Firestore
 */

import cron from 'node-cron';
import { syncStaysData, getSyncStatus } from '../services/sync/SyncService.js';
import { config } from '../config/env.js';

let syncJob: cron.ScheduledTask | null = null;

/**
 * Starts the sync cron job
 */
export function startScheduler(): void {
  const intervalMinutes = config.sync.intervalMinutes;

  // Create cron expression: */5 * * * * means every 5 minutes
  const cronExpression = `*/${intervalMinutes} * * * *`;

  console.log(`⏰ Starting scheduler with interval: every ${intervalMinutes} minutes`);

  syncJob = cron.schedule(cronExpression, async () => {
    console.log(`\n🕐 [${new Date().toISOString()}] Scheduled sync triggered`);

    // Check if sync is already running
    const status = await getSyncStatus();
    if (status?.status === 'running') {
      console.log('⏭️ Skipping: sync already in progress');
      return;
    }

    try {
      const result = await syncStaysData();
      console.log(`📊 Sync result:`, {
        success: result.success,
        bookings: result.bookingsCount,
        listings: result.listingsCount,
        duration: `${result.durationMs}ms`,
      });
    } catch (error) {
      console.error('❌ Scheduled sync error:', error);
    }
  });

  console.log('✅ Scheduler started');
}

/**
 * Stops the sync cron job
 */
export function stopScheduler(): void {
  if (syncJob) {
    syncJob.stop();
    syncJob = null;
    console.log('⏹️ Scheduler stopped');
  }
}

/**
 * Runs an initial sync on startup
 */
export async function runInitialSync(): Promise<void> {
  console.log('🚀 Running initial sync on startup...');

  const status = await getSyncStatus();

  // Skip if already running
  if (status?.status === 'running') {
    console.log('⏭️ Skipping initial sync: already in progress');
    return;
  }

  // Run sync if never synced or last sync was more than interval ago
  if (status?.status === 'never' || !status?.lastSyncAt) {
    try {
      const result = await syncStaysData();
      console.log('📊 Initial sync completed:', {
        success: result.success,
        bookings: result.bookingsCount,
        listings: result.listingsCount,
        duration: `${result.durationMs}ms`,
      });
    } catch (error) {
      console.error('❌ Initial sync error:', error);
    }
  } else {
    console.log('ℹ️ Skipping initial sync: recent data available');
  }
}
