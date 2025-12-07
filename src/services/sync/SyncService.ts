/**
 * Sync Service - Synchronizes data from Stays.net API to MongoDB Atlas
 * Handles batch processing with rate limiting to avoid API throttling
 */

import PQueue from 'p-queue';
import { format, subDays, addDays, differenceInDays, parseISO } from 'date-fns';
import { staysApiClient } from '../stays/StaysApiClient.js';
import { getCollections } from '../../config/mongodb.js';
import { config } from '../../config/env.js';
import type {
  StaysBooking,
  ListingDetails,
  FirestoreSyncStatus,
} from '../stays/types.js';

// Queue configurations for rate limiting
const BOOKING_DETAILS_CONCURRENCY = 10;
const BOOKING_DETAILS_DELAY = 500; // ms between batches
const LISTING_DETAILS_CONCURRENCY = 10;
const LISTING_DETAILS_DELAY = 200; // ms between batches

/**
 * Updates the sync status in MongoDB
 */
async function updateSyncStatus(
  status: FirestoreSyncStatus['status'],
  error: string | null = null,
  stats: { bookingsCount?: number; listingsCount?: number; durationMs?: number } = {}
): Promise<void> {
  const now = new Date();
  const collections = getCollections();

  const updateData: Record<string, unknown> = {
    status,
    updatedAt: now,
  };

  if (status === 'success' || status === 'error') {
    updateData.lastSyncAt = now;
  }

  if (error !== null) {
    updateData.lastError = error;
  }

  if (stats.bookingsCount !== undefined) {
    updateData.bookingsCount = stats.bookingsCount;
  }

  if (stats.listingsCount !== undefined) {
    updateData.listingsCount = stats.listingsCount;
  }

  if (stats.durationMs !== undefined) {
    updateData.durationMs = stats.durationMs;
  }

  await collections.syncStatus.updateOne(
    { _id: 'current' } as any,
    { $set: updateData },
    { upsert: true }
  );
}

/**
 * Fetches detailed booking information with rate limiting
 */
async function fetchBookingDetails(
  bookings: StaysBooking[]
): Promise<Map<string, StaysBooking>> {
  const detailsMap = new Map<string, StaysBooking>();
  const queue = new PQueue({ concurrency: BOOKING_DETAILS_CONCURRENCY });

  console.log(`📋 Fetching details for ${bookings.length} bookings...`);

  const tasks = bookings.map((booking) =>
    queue.add(async () => {
      try {
        const details = await staysApiClient.getBookingDetails(booking._id);
        detailsMap.set(booking._id, details);
      } catch (error) {
        console.warn(`⚠️ Failed to fetch details for booking ${booking._id}:`, error);
        // Use the basic booking data if details fetch fails
        detailsMap.set(booking._id, booking);
      }
    })
  );

  // Add delay between batches
  queue.on('next', () => {
    if (queue.pending === 0 && queue.size > 0) {
      return new Promise((resolve) => setTimeout(resolve, BOOKING_DETAILS_DELAY));
    }
  });

  await Promise.all(tasks);
  console.log(`✅ Fetched details for ${detailsMap.size} bookings`);

  return detailsMap;
}

/**
 * Fetches listing details for unique listings with rate limiting
 */
async function fetchListingDetails(
  listingIds: string[]
): Promise<Map<string, ListingDetails>> {
  const detailsMap = new Map<string, ListingDetails>();
  const uniqueIds = [...new Set(listingIds)];
  const queue = new PQueue({ concurrency: LISTING_DETAILS_CONCURRENCY });

  console.log(`🏠 Fetching details for ${uniqueIds.length} listings...`);

  const tasks = uniqueIds.map((listingId) =>
    queue.add(async () => {
      try {
        const details = await staysApiClient.getListingDetails(listingId);
        detailsMap.set(listingId, details);
      } catch (error) {
        console.warn(`⚠️ Failed to fetch listing ${listingId}:`, error);
      }
    })
  );

  // Add delay between batches
  queue.on('next', () => {
    if (queue.pending === 0 && queue.size > 0) {
      return new Promise((resolve) => setTimeout(resolve, LISTING_DETAILS_DELAY));
    }
  });

  await Promise.all(tasks);
  console.log(`✅ Fetched details for ${detailsMap.size} listings`);

  return detailsMap;
}

/**
 * Writes listings to MongoDB using bulkWrite
 */
async function writeListingsToMongo(
  listings: Map<string, ListingDetails>
): Promise<number> {
  const collections = getCollections();
  const entries = Array.from(listings.entries());
  const now = new Date();

  if (entries.length === 0) return 0;

  const operations = entries.map(([listingId, listing]) => ({
    updateOne: {
      filter: { _id: listingId } as any,
      update: {
        $set: {
          staysListingId: listing._id,
          internalName: listing.internalName || null,
          name: listing.name || null,
          address: listing.address || null,
          thumbnailUrl: null,
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
        },
      },
      upsert: true,
    },
  }));

  const result = await collections.listings.bulkWrite(operations as any);
  return result.upsertedCount + result.modifiedCount;
}

/**
 * Writes reservations to MongoDB using bulkWrite
 */
async function writeReservationsToMongo(
  bookings: Map<string, StaysBooking>
): Promise<number> {
  const collections = getCollections();
  const entries = Array.from(bookings.entries());
  const now = new Date();

  if (entries.length === 0) return 0;

  const operations = entries.map(([bookingId, booking]) => {
    // Get platform from partner or source
    const platform = booking.partner?.name || booking.source || null;

    // Get guest name from guestsDetails
    const guestName = booking.guestsDetails?.name || null;

    return {
      updateOne: {
        filter: { _id: bookingId } as any,
        update: {
          $set: {
            staysReservationId: booking._id,
            staysBookingCode: booking.id,
            listingId: booking._idlisting,
            type: booking.type,
            checkInDate: booking.checkInDate,
            checkInTime: booking.checkInTime || null,
            checkOutDate: booking.checkOutDate,
            checkOutTime: booking.checkOutTime || null,
            guestName,
            guestCount: booking.guests || booking.stats?.adults + booking.stats?.children + booking.stats?.babies || 0,
            adults: booking.stats?.adults || 0,
            children: booking.stats?.children || 0,
            babies: booking.stats?.babies || 0,
            nights: booking.stats?.nights || 0,
            platform,
            channelName: booking.channelName || null,
            source: booking.source || null,
            status: booking.status || null,
            priceValue: booking.price?.value || null,
            priceCurrency: booking.price?.currency || null,
            updatedAt: now,
            syncedAt: now,
          },
          $setOnInsert: {
            createdAt: now,
          },
        },
        upsert: true,
      },
    };
  });

  const result = await collections.reservations.bulkWrite(operations as any);
  return result.upsertedCount + result.modifiedCount;
}

/**
 * Get platform image path
 */
function getPlatformImage(platform: string | null): string {
  if (!platform) return '/images/platforms/default.png';

  const normalizedPlatform = platform.toLowerCase().trim();
  const platformImageMap: Record<string, string> = {
    'airbnb': '/images/platforms/airbnb.png',
    'api airbnb': '/images/platforms/airbnb.png',
    'booking': '/images/platforms/booking.png',
    'booking.com': '/images/platforms/booking.png',
    'expedia': '/images/platforms/expedia.png',
    'vrbo': '/images/platforms/vrbo.png',
    'tripadvisor': '/images/platforms/tripadvisor.png',
    'homeaway': '/images/platforms/homeaway.png',
    'stays': '/images/platforms/stays.png',
    'stays.net': '/images/platforms/stays.png',
    'direct': '/images/platforms/direct.png',
    'direto': '/images/platforms/direct.png',
    'website': '/images/platforms/direct.png',
    'manual': '/images/platforms/direct.png',
  };

  // Check for partial matches
  for (const [key, value] of Object.entries(platformImageMap)) {
    if (normalizedPlatform.includes(key)) {
      return value;
    }
  }

  return '/images/platforms/default.png';
}

/**
 * Calculate nights between two dates (YYYY-MM-DD format)
 */
function calculateNights(checkInDate: string, checkOutDate: string): number {
  try {
    const checkIn = parseISO(checkInDate);
    const checkOut = parseISO(checkOutDate);
    const nights = differenceInDays(checkOut, checkIn);
    return nights > 0 ? nights : 0;
  } catch {
    return 0;
  }
}

/**
 * Writes unified bookings to MongoDB (reservation + listing data combined)
 */
async function writeUnifiedBookingsToMongo(
  bookings: Map<string, StaysBooking>,
  listings: Map<string, ListingDetails>
): Promise<number> {
  const collections = getCollections();
  const entries = Array.from(bookings.entries());
  const now = new Date();

  if (entries.length === 0) return 0;

  const operations = entries.map(([bookingId, booking]) => {
    // Get listing info
    const listing = listings.get(booking._idlisting);
    const apartmentCode = listing?.internalName || booking._idlisting;
    const listingName = listing?.name || null;
    const listingAddress = listing?.address || null;

    // Get platform
    const platform = booking.partner?.name || booking.source || null;

    // Get guest name
    const guestName = booking.guestsDetails?.name || 'Hóspede';

    // Calculate guest count
    const guestCount = booking.guests ||
      (booking.stats?.adults || 0) + (booking.stats?.children || 0) + (booking.stats?.babies || 0) || 0;

    // Calculate nights - use stats.nights if available, otherwise calculate from dates
    const nights = booking.stats?.nights || calculateNights(booking.checkInDate, booking.checkOutDate);

    return {
      updateOne: {
        filter: { _id: bookingId } as any,
        update: {
          $set: {
            id: booking._id,
            staysReservationId: booking._id,
            staysBookingCode: booking.id,

            // Listing info (denormalized)
            listingId: booking._idlisting,
            apartmentCode,
            listingName,
            listingAddress,

            // Booking type and status
            type: booking.type,
            status: booking.status || null,

            // Dates and times
            checkInDate: booking.checkInDate,
            checkInTime: booking.checkInTime || null,
            checkOutDate: booking.checkOutDate,
            checkOutTime: booking.checkOutTime || null,
            nights,

            // Guest info
            guestName,
            guestCount,
            adults: booking.stats?.adults || 0,
            children: booking.stats?.children || 0,
            babies: booking.stats?.babies || 0,

            // Platform/Source
            platform,
            platformImage: getPlatformImage(platform),
            channelName: booking.channelName || null,
            source: booking.source || null,

            // Price
            priceValue: booking.price?.value || null,
            priceCurrency: booking.price?.currency || null,

            // Timestamps
            updatedAt: now,
            syncedAt: now,
          },
          $setOnInsert: {
            createdAt: now,
          },
        },
        upsert: true,
      },
    };
  });

  const result = await collections.unifiedBookings.bulkWrite(operations as any);
  return result.upsertedCount + result.modifiedCount;
}

/**
 * Main sync function - orchestrates the entire sync process
 */
export async function syncStaysData(): Promise<{
  success: boolean;
  bookingsCount: number;
  listingsCount: number;
  durationMs: number;
  error?: string;
}> {
  const startTime = Date.now();
  console.log('🔄 Starting Stays.net sync...');

  try {
    // 1. Update status to running
    await updateSyncStatus('running');

    // 2. Calculate date range (today ± configured days)
    const today = new Date();
    const fromDate = format(subDays(today, config.sync.dateRangeDays), 'yyyy-MM-dd');
    const toDate = format(addDays(today, config.sync.dateRangeDays), 'yyyy-MM-dd');

    console.log(`📅 Date range: ${fromDate} to ${toDate}`);

    // 3. Fetch all bookings from Stays API
    const bookings = await staysApiClient.getAllBookings(fromDate, toDate, 'included');

    if (bookings.length === 0) {
      console.log('ℹ️ No bookings found in date range');
      const durationMs = Date.now() - startTime;
      await updateSyncStatus('success', null, { bookingsCount: 0, listingsCount: 0, durationMs });
      return { success: true, bookingsCount: 0, listingsCount: 0, durationMs };
    }

    // 4. Fetch detailed booking information
    const bookingDetails = await fetchBookingDetails(bookings);

    // 5. Get unique listing IDs and fetch listing details
    const listingIds = bookings.map((b) => b._idlisting);
    const listingDetails = await fetchListingDetails(listingIds);

    // 6. Write listings to MongoDB
    const listingsWritten = await writeListingsToMongo(listingDetails);
    console.log(`💾 Wrote ${listingsWritten} listings to MongoDB`);

    // 7. Write reservations to MongoDB
    const reservationsWritten = await writeReservationsToMongo(bookingDetails);
    console.log(`💾 Wrote ${reservationsWritten} reservations to MongoDB`);

    // 8. Write unified bookings to MongoDB (denormalized for fast reads)
    const unifiedWritten = await writeUnifiedBookingsToMongo(bookingDetails, listingDetails);
    console.log(`💾 Wrote ${unifiedWritten} unified bookings to MongoDB`);

    // 9. Update sync status to success
    const durationMs = Date.now() - startTime;
    await updateSyncStatus('success', null, {
      bookingsCount: reservationsWritten,
      listingsCount: listingsWritten,
      durationMs,
    });

    console.log(`✅ Sync completed in ${durationMs}ms`);

    return {
      success: true,
      bookingsCount: reservationsWritten,
      listingsCount: listingsWritten,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    let errorMessage = 'Unknown error';

    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (error && typeof error === 'object' && 'message' in error) {
      errorMessage = String((error as { message: unknown }).message);
    } else if (typeof error === 'string') {
      errorMessage = error;
    }

    console.error('❌ Sync failed:', errorMessage, error);
    await updateSyncStatus('error', errorMessage, { durationMs });

    return {
      success: false,
      bookingsCount: 0,
      listingsCount: 0,
      durationMs,
      error: errorMessage,
    };
  }
}

/**
 * Gets the current sync status from MongoDB
 */
export async function getSyncStatus(): Promise<FirestoreSyncStatus | null> {
  const collections = getCollections();
  const doc = await collections.syncStatus.findOne({ _id: 'current' } as any);

  if (!doc) {
    return {
      lastSyncAt: null,
      status: 'never',
      lastError: null,
      bookingsCount: 0,
      listingsCount: 0,
      durationMs: 0,
      updatedAt: new Date(),
    };
  }

  return {
    lastSyncAt: doc.lastSyncAt || null,
    status: doc.status || 'never',
    lastError: doc.lastError || null,
    bookingsCount: doc.bookingsCount || 0,
    listingsCount: doc.listingsCount || 0,
    durationMs: doc.durationMs || 0,
    updatedAt: doc.updatedAt || new Date(),
  };
}
