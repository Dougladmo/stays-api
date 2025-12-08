/**
 * Financials Service - Calculates financial metrics from MongoDB data
 */

import { format, parseISO, differenceInDays } from 'date-fns';
import { getCollections } from '../config/mongodb.js';
import type {
  FirestoreUnifiedBooking,
  FinancialSummary,
  PropertyFinancials,
  ChannelFinancials,
} from './stays/types.js';

/**
 * Fetches unified bookings for a date range
 */
async function getBookingsForPeriod(
  from: string,
  to: string,
  includeBlocked = false
): Promise<FirestoreUnifiedBooking[]> {
  const collections = getCollections();

  const query: Record<string, unknown> = {
    checkOutDate: { $gte: from },
    checkInDate: { $lte: to },
  };

  if (!includeBlocked) {
    query.type = { $ne: 'blocked' };
  }

  const docs = await collections.unifiedBookings.find(query).toArray();
  return docs as unknown as FirestoreUnifiedBooking[];
}

/**
 * Gets all unique listings from MongoDB
 */
async function getAllListings(): Promise<Map<string, { code: string; name: string | null }>> {
  const collections = getCollections();
  const docs = await collections.unifiedBookings
    .aggregate([
      {
        $group: {
          _id: '$listingId',
          apartmentCode: { $first: '$apartmentCode' },
          listingName: { $first: '$listingName' },
        },
      },
    ])
    .toArray();

  const listings = new Map<string, { code: string; name: string | null }>();
  docs.forEach((doc) => {
    listings.set(doc._id as string, {
      code: doc.apartmentCode as string,
      name: doc.listingName as string | null,
    });
  });

  return listings;
}

/**
 * Calculates financial summary for a period
 */
export async function getFinancialSummary(
  from: string,
  to: string
): Promise<FinancialSummary> {
  const bookings = await getBookingsForPeriod(from, to);
  const listings = await getAllListings();

  // Calculate period days
  const periodDays = differenceInDays(parseISO(to), parseISO(from)) + 1;
  const totalAvailableNights = listings.size * periodDays;

  let totalRevenue = 0;
  let totalNights = 0;
  let reservationsCount = 0;

  bookings.forEach((booking) => {
    if (booking.type !== 'blocked') {
      const value = booking.priceValue || 0;
      totalRevenue += value;
      totalNights += booking.nights || 0;
      reservationsCount++;
    }
  });

  const averageDailyRate = totalNights > 0 ? totalRevenue / totalNights : 0;
  const occupancyRate = totalAvailableNights > 0
    ? (totalNights / totalAvailableNights) * 100
    : 0;
  const revPAR = totalAvailableNights > 0
    ? totalRevenue / totalAvailableNights
    : 0;

  return {
    totalRevenue,
    paidRevenue: totalRevenue, // Simplified - would need payment data
    pendingRevenue: 0,
    averageDailyRate: Math.round(averageDailyRate * 100) / 100,
    revPAR: Math.round(revPAR * 100) / 100,
    totalNights,
    availableNights: totalAvailableNights,
    occupancyRate: Math.round(occupancyRate * 10) / 10,
    reservationsCount,
    extraServicesRevenue: 0, // Would need extra services data
    period: { from, to },
  };
}

/**
 * Calculates financial data by property
 */
export async function getFinancialsByProperty(
  from: string,
  to: string
): Promise<PropertyFinancials[]> {
  const bookings = await getBookingsForPeriod(from, to);
  const listings = await getAllListings();

  // Calculate period days for occupancy
  const periodDays = differenceInDays(parseISO(to), parseISO(from)) + 1;

  // Group bookings by property
  const propertyData = new Map<string, {
    revenue: number;
    nights: number;
    count: number;
    name: string | null;
  }>();

  // Initialize all properties with zero values
  listings.forEach((listing, listingId) => {
    propertyData.set(listingId, {
      revenue: 0,
      nights: 0,
      count: 0,
      name: listing.name,
    });
  });

  // Aggregate booking data
  bookings.forEach((booking) => {
    if (booking.type !== 'blocked') {
      const existing = propertyData.get(booking.listingId) || {
        revenue: 0,
        nights: 0,
        count: 0,
        name: booking.listingName,
      };

      existing.revenue += booking.priceValue || 0;
      existing.nights += booking.nights || 0;
      existing.count++;

      propertyData.set(booking.listingId, existing);
    }
  });

  // Build result array
  const result: PropertyFinancials[] = [];

  listings.forEach((listing, listingId) => {
    const data = propertyData.get(listingId)!;
    const adr = data.nights > 0 ? data.revenue / data.nights : 0;
    const occupancy = periodDays > 0 ? (data.nights / periodDays) * 100 : 0;

    result.push({
      propertyCode: listing.code,
      propertyName: listing.name,
      revenue: data.revenue,
      paidRevenue: data.revenue, // Simplified
      pendingRevenue: 0,
      bookingsCount: data.count,
      nights: data.nights,
      averageDailyRate: Math.round(adr * 100) / 100,
      occupancyRate: Math.round(occupancy * 10) / 10,
    });
  });

  // Sort by revenue descending
  result.sort((a, b) => b.revenue - a.revenue);

  return result;
}

/**
 * Calculates financial data by channel/platform
 */
export async function getFinancialsByChannel(
  from: string,
  to: string
): Promise<ChannelFinancials[]> {
  const bookings = await getBookingsForPeriod(from, to);

  // Group bookings by channel
  const channelData = new Map<string, {
    revenue: number;
    count: number;
  }>();

  let totalRevenue = 0;

  bookings.forEach((booking) => {
    if (booking.type !== 'blocked') {
      const channel = booking.platform || booking.channelName || 'Direct';
      const value = booking.priceValue || 0;

      const existing = channelData.get(channel) || { revenue: 0, count: 0 };
      existing.revenue += value;
      existing.count++;
      channelData.set(channel, existing);

      totalRevenue += value;
    }
  });

  // Build result array
  const result: ChannelFinancials[] = [];

  channelData.forEach((data, channel) => {
    const avgValue = data.count > 0 ? data.revenue / data.count : 0;
    const percentage = totalRevenue > 0 ? (data.revenue / totalRevenue) * 100 : 0;

    result.push({
      channel,
      revenue: data.revenue,
      bookingsCount: data.count,
      averageValue: Math.round(avgValue * 100) / 100,
      percentage: Math.round(percentage * 10) / 10,
    });
  });

  // Sort by revenue descending
  result.sort((a, b) => b.revenue - a.revenue);

  return result;
}

/**
 * Gets monthly revenue trend for the last 12 months
 */
export async function getRevenueTrend(): Promise<Array<{ month: string; revenue: number; bookings: number }>> {
  const today = new Date();
  const trend: Array<{ month: string; revenue: number; bookings: number }> = [];

  // Get last 12 months
  for (let i = 11; i >= 0; i--) {
    const monthStart = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);

    const from = format(monthStart, 'yyyy-MM-dd');
    const to = format(monthEnd, 'yyyy-MM-dd');

    const bookings = await getBookingsForPeriod(from, to);

    let monthRevenue = 0;
    let monthBookings = 0;

    bookings.forEach((booking) => {
      if (booking.type !== 'blocked') {
        monthRevenue += booking.priceValue || 0;
        monthBookings++;
      }
    });

    trend.push({
      month: format(monthStart, 'MMM/yy'),
      revenue: monthRevenue,
      bookings: monthBookings,
    });
  }

  return trend;
}
