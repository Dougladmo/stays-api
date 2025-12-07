/**
 * Calendar Service - Reads from unified Firestore collection
 * Simplified version that reads pre-denormalized data
 */

import { collections } from '../config/firebase.js';
import { getSyncStatus } from './sync/SyncService.js';
import type { FirestoreUnifiedBooking } from './stays/types.js';

// Response types
export interface CalendarReservation {
  id: string;
  bookingId: string;
  guestName: string;
  type: 'reserved' | 'blocked' | 'provisional';
  startDate: string;
  endDate: string;
  platform: string | null;
  platformImage: string;
  nights: number;
  guestCount: number;
  adults: number;
  children: number;
  babies: number;
  checkInTime: string | null;
  checkOutTime: string | null;
}

export interface CalendarUnit {
  id: string;
  code: string;
  name: string | null;
  reservations: CalendarReservation[];
}

export interface CalendarResponse {
  units: CalendarUnit[];
  lastSyncAt: string | null;
  syncStatus: string;
}

/**
 * Maps booking type to calendar type
 */
function mapReservationType(type: string): 'reserved' | 'blocked' | 'provisional' {
  switch (type) {
    case 'blocked':
      return 'blocked';
    case 'provisional':
      return 'provisional';
    default:
      return 'reserved';
  }
}

/**
 * Fetches unified bookings within a date range from Firestore
 */
async function getUnifiedBookingsInRange(
  from: string,
  to: string
): Promise<FirestoreUnifiedBooking[]> {
  // Get bookings that overlap with the date range
  const snapshot = await collections.unifiedBookings
    .where('checkOutDate', '>=', from)
    .get();

  const bookings: FirestoreUnifiedBooking[] = [];

  snapshot.docs.forEach((doc) => {
    const data = doc.data() as FirestoreUnifiedBooking;
    if (data.checkInDate <= to) {
      bookings.push(data);
    }
  });

  return bookings;
}

/**
 * Generates the calendar data
 */
export async function getCalendarData(from: string, to: string): Promise<CalendarResponse> {
  // Fetch data from Firestore
  const [bookings, syncStatus] = await Promise.all([
    getUnifiedBookingsInRange(from, to),
    getSyncStatus(),
  ]);

  // Group bookings by listing
  const bookingsByListing = new Map<string, FirestoreUnifiedBooking[]>();
  const listingInfo = new Map<string, { code: string; name: string | null }>();

  bookings.forEach((booking) => {
    const listingId = booking.listingId;

    if (!bookingsByListing.has(listingId)) {
      bookingsByListing.set(listingId, []);
      listingInfo.set(listingId, {
        code: booking.apartmentCode,
        name: booking.listingName,
      });
    }

    bookingsByListing.get(listingId)!.push(booking);
  });

  // Build calendar units
  const units: CalendarUnit[] = [];

  listingInfo.forEach((info, listingId) => {
    const listingBookings = bookingsByListing.get(listingId) || [];

    const calendarReservations: CalendarReservation[] = listingBookings.map((booking) => ({
      id: booking.staysReservationId,
      bookingId: booking.staysBookingCode,
      guestName: booking.guestName,
      type: mapReservationType(booking.type),
      startDate: booking.checkInDate,
      endDate: booking.checkOutDate,
      platform: booking.platform,
      platformImage: booking.platformImage,
      nights: booking.nights,
      guestCount: booking.guestCount,
      adults: booking.adults,
      children: booking.children,
      babies: booking.babies,
      checkInTime: booking.checkInTime,
      checkOutTime: booking.checkOutTime,
    }));

    // Sort reservations by start date
    calendarReservations.sort((a, b) => a.startDate.localeCompare(b.startDate));

    units.push({
      id: listingId,
      code: info.code,
      name: info.name,
      reservations: calendarReservations,
    });
  });

  // Sort units by code
  units.sort((a, b) => a.code.localeCompare(b.code));

  return {
    units,
    lastSyncAt: syncStatus?.lastSyncAt?.toDate?.()?.toISOString() || null,
    syncStatus: syncStatus?.status || 'never',
  };
}
