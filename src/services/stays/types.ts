/**
 * Type definitions for Stays.net API responses
 * Based on Stays.net Booking API documentation
 */

/**
 * Booking type classification
 */
export type BookingType = 'normal' | 'provisional' | 'blocked';

/**
 * Date type filter for API queries
 */
export type DateType = 'arrival' | 'departure' | 'creation' | 'creationorig' | 'included';

/**
 * Hosting details fee
 */
export interface HostingFee {
  name: string;
  _f_val: number;
}

/**
 * Hosting details section
 */
export interface HostingDetails {
  fees: HostingFee[];
  discounts: unknown[];
  _f_nightPrice: number;
  _f_total: number;
}

/**
 * Extras details section
 */
export interface ExtrasDetails {
  fees: unknown[];
  extraServices: unknown[];
  discounts: unknown[];
  _f_total: number;
}

/**
 * Fee structure from Stays.net API
 */
export interface StaysFee {
  val: number;
  name?: string;
  description?: string;
}

/**
 * Booking price information - Updated to match actual Stays API response
 */
export interface BookingPrice {
  currency: string;
  // New fields from actual API
  _f_expected?: number;  // Total nights value
  _f_total?: number;     // Total including fees
  hostingDetails?: HostingDetails;
  extrasDetails?: ExtrasDetails;
  // Financial detailed fields (from Stays.net API)
  pricePerNight?: number;          // Valor por noite
  reserveTotal?: number;            // Total da reserva
  baseAmountForwarding?: number;    // Base de cálculo do Imposto
  sellPriceCorrected?: number;      // Preço de venda corrigido
  companyCommision?: number;        // Comissão da empresa
  buyPrice?: number;                // Preço de compra
  totalForwardFee?: number;         // Total de taxas repassadas
  fee?: StaysFee[];                 // Taxas (limpeza, etc)
  ownerFee?: StaysFee[];            // Taxas do proprietário
  // Legacy fields (kept for backward compatibility)
  value?: number;
  cleaning?: number;
  securityDeposit?: number;
  extras?: number;
}

/**
 * Booking statistics - Updated to match actual Stays API response
 */
export interface BookingStats {
  // New field from actual API
  _f_totalPaid?: number;  // Total paid amount
  // Legacy fields (kept for backward compatibility)
  nights?: number;
  pricePerNight?: number;
  adults?: number;
  children?: number;
  babies?: number;
}

/**
 * Individual guest in the guests list
 */
export interface GuestListItem {
  name: string;
  email?: string;
  primary?: boolean;
  type?: 'adult' | 'child' | 'baby';
}

/**
 * Partner/Platform information
 */
export interface Partner {
  id: string;
  name: string;
}

/**
 * Listing/Property information
 */
export interface Listing {
  _id: string;
  internalName?: string;
  name?: string;
  address?: string;
}

/**
 * Guest details information
 */
export interface GuestsDetails {
  name?: string;
  email?: string;
  phone?: string;
  document?: string;
  address?: string;
  city?: string;
  country?: string;
  notes?: string;
  adults?: number;
  children?: number;
  list?: GuestListItem[];
}

/**
 * Complete booking response from Stays API
 */
export interface StaysBooking {
  _id: string;
  id: string; // Guest code like "STA-7767", "CHE-6442"
  creationDate: string;
  checkInDate: string; // YYYY-MM-DD
  checkInTime: string; // HH:MM
  checkOutDate: string; // YYYY-MM-DD
  checkOutTime: string; // HH:MM
  _idlisting: string;
  _idclient: string;
  type: BookingType;
  price: BookingPrice;
  stats: BookingStats;
  guests: number;
  guestsDetails: GuestsDetails;
  source?: string;
  channelName?: string;
  status?: string;
  partner?: Partner;
  listing?: Listing;
}

/**
 * Request parameters for retrieving booking data
 */
export interface GetBookingsParams {
  /** Start date (YYYY-MM-DD) */
  from: string;
  /** End date (YYYY-MM-DD) */
  to: string;
  /** Date type filter - determines which date field to use */
  dateType?: DateType;
  /** Number of records to skip (pagination) */
  skip?: number;
  /** Maximum number of records to return (max 20) */
  limit?: number;
}

/**
 * Listing information from Content API
 */
export interface ListingDetails {
  _id: string;
  id: string;
  internalName?: string; // Apartment code like "I-VP-455-503"
  name?: string;
  address?: string;
  _mstitle?: Record<string, string>; // Multi-language titles
}

/**
 * API error response
 */
export interface StaysApiError {
  message: string;
  statusCode: number;
  details?: unknown;
}

// ==================== PAYMENT TYPES ====================

/**
 * Payment status
 */
export type PaymentStatus = 'pending' | 'paid' | 'partial' | 'refunded' | 'canceled';

/**
 * Payment method
 */
export type PaymentMethod = 'credit_card' | 'debit_card' | 'pix' | 'bank_transfer' | 'cash' | 'other';

/**
 * Individual payment for a reservation
 */
export interface StaysPayment {
  _id: string;
  value: number;
  currency: string;
  date: string;
  dueDate?: string;
  method?: PaymentMethod;
  status: PaymentStatus;
  description?: string;
  fees?: number;
  taxes?: number;
}

/**
 * Payment summary for a reservation
 */
export interface PaymentSummary {
  totalValue: number;
  paidValue: number;
  pendingValue: number;
  paymentStatus: PaymentStatus;
  payments: StaysPayment[];
}

// ==================== EXTRA SERVICE TYPES ====================

/**
 * Extra service for a reservation
 */
export interface StaysExtraService {
  _id: string;
  name: string;
  value: number;
  currency: string;
  quantity: number;
  category?: string;
  description?: string;
}

// ==================== CLIENT/GUEST TYPES ====================

/**
 * Client/Guest from Stays API
 */
export interface StaysClient {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  document?: string;
  documentType?: string;
  birthDate?: string;
  nationality?: string;
  country?: string;
  city?: string;
  address?: string;
  language?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Parameters for client search
 */
export interface GetClientsParams {
  skip?: number;
  limit?: number;
  name?: string;
  email?: string;
  phone?: string;
}

// ==================== FINANCIAL SUMMARY TYPES ====================

/**
 * Financial summary for a period
 */
export interface FinancialSummary {
  totalRevenue: number;
  paidRevenue: number;
  pendingRevenue: number;
  averageDailyRate: number;
  revPAR: number;
  totalNights: number;
  availableNights: number;
  occupancyRate: number;
  reservationsCount: number;
  extraServicesRevenue: number;
  period: {
    from: string;
    to: string;
  };
}

/**
 * Detailed financial data for a single reservation
 */
export interface ReservationFinancialDetails {
  // Identification
  reservationId: string;
  bookingCode: string;
  propertyCode: string;
  propertyName: string | null;
  guestName: string;

  // Dates
  checkInDate: string;
  checkOutDate: string;
  nights: number;

  // Channel
  channel: string;
  platform: string | null;

  // Financial Data
  pricePerNight: number;           // Valor por noite
  reserveTotal: number;            // Total da reserva
  baseAmountForwarding: number;    // Base de cálculo do Imp
  sellPriceCorrected: number;      // Preço de venda corrigido
  companyCommission: number;       // Comissão da empresa
  buyPrice: number;                // Preço de compra
  totalForwardFee: number;         // Total de taxas

  // Fees breakdown
  cleaningFee: number;             // Taxa de Limpeza
  ownerFees: Array<{               // Taxas do proprietário
    name: string;
    value: number;
  }>;
  otherFees: Array<{               // Outras taxas
    name: string;
    value: number;
  }>;

  // Currency
  currency: string;
}

/**
 * Financial data by property
 */
export interface PropertyFinancials {
  propertyCode: string;
  propertyName: string | null;
  revenue: number;
  paidRevenue: number;
  pendingRevenue: number;
  bookingsCount: number;
  nights: number;
  averageDailyRate: number;
  occupancyRate: number;
}

/**
 * Financial data by channel/platform
 */
export interface ChannelFinancials {
  channel: string;
  revenue: number;
  bookingsCount: number;
  averageValue: number;
  percentage: number;
}

// ==================== STATISTICS TYPES ====================

/**
 * Booking statistics summary
 */
export interface BookingStatistics {
  totalBookings: number;
  confirmedBookings: number;
  canceledBookings: number;
  blockedDates: number;
  cancellationRate: number;
  averageLeadTime: number;
  averageStayLength: number;
  totalGuests: number;
  averageGuestsPerBooking: number;
  bySource: Record<string, number>;
  byMonth: Record<string, number>;
  byDayOfWeek: Record<string, number>;
}

/**
 * Occupancy data by property
 */
export interface OccupancyData {
  propertyCode: string;
  propertyName: string | null;
  totalNights: number;
  occupiedNights: number;
  blockedNights: number;
  availableNights: number;
  occupancyRate: number;
  blockRate: number;
}

/**
 * Cancellation analysis
 */
export interface CancellationData {
  totalCancellations: number;
  cancellationRate: number;
  averageAdvanceNotice: number;
  byChannel: Record<string, number>;
  byMonth: Record<string, number>;
  revenueImpact: number;
}

// ==================== GUEST ANALYTICS TYPES ====================

/**
 * Returning guest data
 */
export interface ReturningGuest {
  clientId: string;
  name: string;
  email?: string;
  country?: string;
  language?: string;
  totalStays: number;
  totalNights: number;
  totalRevenue: number;
  firstStay: string;
  lastStay: string;
  properties: string[];
}

/**
 * Guest demographics summary
 */
export interface GuestDemographics {
  byCountry: Record<string, number>;
  byLanguage: Record<string, number>;
  returningGuestsRate: number;
  averageGroupSize: number;
  withChildren: number;
  withBabies: number;
}

// ==================== CALENDAR TYPES ====================

/**
 * Calendar day availability
 */
export interface CalendarDay {
  date: string;
  available: boolean;
  blocked: boolean;
  booked: boolean;
  price?: number;
  minStay?: number;
  reservationId?: string;
}

/**
 * Guest status classification for dashboard
 */
export type GuestStatus = 'checkin' | 'checkout' | 'staying';

// MongoDB document types (keeping "Firestore" prefix for backward compatibility)
export interface FirestoreListing {
  staysListingId: string;
  internalName: string | null;
  name: string | null;
  address: string | null;
  thumbnailUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FirestoreReservation {
  staysReservationId: string;
  staysBookingCode: string;
  listingId: string;
  type: BookingType;
  checkInDate: string;
  checkInTime: string | null;
  checkOutDate: string;
  checkOutTime: string | null;
  guestName: string | null;
  guestCount: number;
  adults: number;
  children: number;
  babies: number;
  nights: number;
  platform: string | null;
  channelName: string | null;
  source: string | null;
  status: string | null;
  priceValue: number | null;
  priceCurrency: string | null;
  createdAt: Date;
  updatedAt: Date;
  syncedAt: Date;
}

export interface FirestoreSyncStatus {
  lastSyncAt: Date | null;
  status: 'success' | 'error' | 'running' | 'never';
  lastError: string | null;
  bookingsCount: number;
  listingsCount: number;
  durationMs: number;
  updatedAt: Date;
}

/**
 * Unified booking document - combines reservation + listing data
 * Single source of truth for Dashboard and Calendar views
 */
export interface FirestoreUnifiedBooking {
  // Reservation IDs
  id: string; // Document ID = staysReservationId
  staysReservationId: string;
  staysBookingCode: string;

  // Listing info (denormalized)
  listingId: string;
  apartmentCode: string; // internalName from listing
  listingName: string | null;
  listingAddress: string | null;

  // Booking type and status
  type: BookingType;
  status: string | null;

  // Dates and times
  checkInDate: string;
  checkInTime: string | null;
  checkOutDate: string;
  checkOutTime: string | null;
  nights: number;

  // Guest info
  guestName: string;
  guestCount: number;
  adults: number;
  children: number;
  babies: number;

  // Platform/Source
  platform: string | null;
  platformImage: string;
  channelName: string | null;
  source: string | null;

  // Price
  priceValue: number | null;
  priceCurrency: string | null;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  syncedAt: Date;
}

// ==================== INVENTORY REFERENCE TYPES ====================

/**
 * Inventory category from Stays.net translation endpoint
 */
export interface StaysInventoryCategory {
  _id: string;
  _mstitle: Record<string, string>; // { 'pt_BR': 'Enxoval', 'en_US': 'Linen' }
}

/**
 * Inventory item type from Stays.net translation endpoint
 */
export interface StaysInventoryItem {
  _id: string;
  _mstitle: Record<string, string>;
  categoryId?: string;
}

/**
 * Inventory item condition from Stays.net translation endpoint
 */
export interface StaysInventoryCondition {
  _id: string;
  _mstitle: Record<string, string>;
}

// ==================== INVENTORY DOCUMENT TYPES ====================

/**
 * Inventory category enum (matching centralcasape types.ts)
 */
export type InventoryCategory = 'LINEN' | 'ELECTRONICS' | 'AMENITY' | 'FURNITURE' | 'UTENSIL' | 'OTHER';

/**
 * Transaction type enum (matching centralcasape types.ts)
 */
export type TransactionType = 'PURCHASE' | 'TRANSFER' | 'CONSUMPTION' | 'BREAKAGE' | 'LOSS' | 'ADJUSTMENT';

/**
 * Inventory item document stored in MongoDB
 */
export interface InventoryItemDoc {
  _id: string;
  id: string;
  name: string;
  brand?: string;
  model?: string;
  dimensions?: string;
  description?: string;
  category: InventoryCategory;
  minStock: number;
  stock: Record<string, number>; // { 'CENTRAL': 10, 'I-VP-455': 2 }
  staysReferenceItemId?: string;
  staysReferenceCategoryId?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Inventory transaction document stored in MongoDB
 */
export interface InventoryTransactionDoc {
  _id: string;
  id: string;
  itemId: string;
  itemName: string;
  type: TransactionType;
  quantity: number;
  source: string;
  destination: string;
  user: string;
  notes?: string;
  timestamp: Date;
  createdAt: Date;
}

/**
 * Reference category document (synced from Stays.net)
 */
export interface InventoryReferenceCategory {
  _id: string;
  staysCategoryId: string;
  titles: Record<string, string>;
  titlePtBr: string;
  syncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Reference item document (synced from Stays.net)
 */
export interface InventoryReferenceItem {
  _id: string;
  staysItemId: string;
  titles: Record<string, string>;
  titlePtBr: string;
  categoryId?: string;
  syncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Reference condition document (synced from Stays.net)
 */
export interface InventoryReferenceCondition {
  _id: string;
  staysConditionId: string;
  titles: Record<string, string>;
  titlePtBr: string;
  syncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating a new inventory item
 */
export interface CreateInventoryItemInput {
  name: string;
  brand?: string;
  model?: string;
  dimensions?: string;
  description?: string;
  category: InventoryCategory;
  minStock: number;
  stock?: Record<string, number>;
  staysReferenceItemId?: string;
  staysReferenceCategoryId?: string;
}

/**
 * Input for updating an inventory item
 */
export interface UpdateInventoryItemInput {
  name?: string;
  brand?: string;
  model?: string;
  dimensions?: string;
  description?: string;
  category?: InventoryCategory;
  minStock?: number;
  stock?: Record<string, number>;
}

/**
 * Input for creating a transaction
 */
export interface CreateTransactionInput {
  itemId: string;
  type: TransactionType;
  quantity: number;
  source: string;
  destination: string;
  user: string;
  notes?: string;
}
