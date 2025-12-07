/**
 * Stays.net API client for Node.js
 * Handles authentication and API requests to Stays.net Booking and Content APIs
 */

import { config } from '../../config/env.js';
import type {
  GetBookingsParams,
  StaysBooking,
  StaysApiError,
  ListingDetails
} from './types.js';

/**
 * Creates Basic Authentication header value
 */
function createBasicAuthHeader(clientId: string, clientSecret: string): string {
  const credentials = `${clientId}:${clientSecret}`;
  const base64Credentials = Buffer.from(credentials).toString('base64');
  return `Basic ${base64Credentials}`;
}

/**
 * Combined API client for Stays.net Booking and Content APIs
 */
export class StaysApiClient {
  private baseUrl: string;
  private authHeader: string;

  constructor(
    baseUrl: string = config.stays.baseUrl,
    clientId: string = config.stays.clientId,
    clientSecret: string = config.stays.clientSecret
  ) {
    this.baseUrl = baseUrl;
    this.authHeader = createBasicAuthHeader(clientId, clientSecret);
  }

  /**
   * Makes an authenticated GET request to the Stays API
   */
  private async get<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': this.authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error: StaysApiError = {
        message: `Stays API error: ${response.statusText}`,
        statusCode: response.status,
        details: await response.text().catch(() => null),
      };
      throw error;
    }

    return response.json() as Promise<T>;
  }

  // ==================== BOOKING API ====================

  /**
   * Retrieves booking/reservation data with pagination
   */
  async getBookings(params: GetBookingsParams): Promise<StaysBooking[]> {
    const { from, to, dateType = 'included', skip = 0, limit = 20 } = params;

    const queryParams: Record<string, string> = {
      from,
      to,
      dateType,
      skip: String(skip),
      limit: String(limit),
    };

    return this.get<StaysBooking[]>(
      '/external/v1/booking/reservations',
      queryParams
    );
  }

  /**
   * Retrieves all bookings with automatic pagination
   * The API returns maximum 20 records per request
   */
  async getAllBookings(
    from: string,
    to: string,
    dateType: GetBookingsParams['dateType'] = 'included'
  ): Promise<StaysBooking[]> {
    const allBookings: StaysBooking[] = [];
    let skip = 0;
    const limit = 20;
    let hasMore = true;

    console.log(`📥 Fetching bookings from ${from} to ${to}...`);

    while (hasMore) {
      const bookings = await this.getBookings({
        from,
        to,
        dateType,
        skip,
        limit,
      });

      allBookings.push(...bookings);

      // If we got less than limit, we've reached the end
      hasMore = bookings.length === limit;
      skip += limit;

      // Safety limit to prevent infinite loops
      if (skip > 1000) {
        console.warn('⚠️ Reached safety limit of 1000 bookings');
        break;
      }
    }

    console.log(`✅ Fetched ${allBookings.length} bookings`);
    return allBookings;
  }

  /**
   * Retrieves detailed information for a specific booking
   * This endpoint returns complete guest details including guest list and partner info
   */
  async getBookingDetails(reservationId: string): Promise<StaysBooking> {
    return this.get<StaysBooking>(
      `/external/v1/booking/reservations/${reservationId}`
    );
  }

  // ==================== CONTENT API ====================

  /**
   * Retrieves listing details including internalName (apartment code)
   */
  async getListingDetails(listingId: string): Promise<ListingDetails> {
    return this.get<ListingDetails>(
      `/external/v1/content/listings/${listingId}`
    );
  }
}

// Export singleton instance
export const staysApiClient = new StaysApiClient();
