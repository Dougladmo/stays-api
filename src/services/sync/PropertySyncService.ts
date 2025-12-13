/**
 * Property Sync Service
 * Synchronizes property/listing data from Stays.net to MongoDB
 * Properties change infrequently, so this runs less often than booking sync
 */

import { staysApiClient } from '../stays/StaysApiClient.js';
import { getCollections } from '../../config/mongodb.js';
import type {
  EnhancedListingDetails,
  PropertyDocument,
} from '../stays/types.js';

// Temporarily disabled - will be re-enabled when amenities endpoint works
// function transformAmenities(
//   amenityIds: string[],
//   amenitiesReference: Map<string, StaysAmenity>
// ): PropertyAmenity[] {
//   return amenityIds
//     .map(id => {
//       const amenity = amenitiesReference.get(id);
//       if (!amenity) return null;
//
//       return {
//         staysAmenityId: amenity._id,
//         name: amenity._mstitle['en_US'] || amenity._mstitle['pt_BR'] || 'Unknown',
//         namePtBr: amenity._mstitle['pt_BR'] || amenity._mstitle['en_US'] || 'Desconhecido',
//         category: amenity.category || 'general',
//         icon: amenity.icon || null,
//       };
//     })
//     .filter((a): a is PropertyAmenity => a !== null);
// }

/**
 * Transform listing data to PropertyDocument
 */
function transformPropertyDocument(
  listing: EnhancedListingDetails
): Omit<PropertyDocument, '_id'> {
  const now = new Date();

  // Extract multilingual title (prefer pt_BR)
  const name = listing._mstitle?.['pt_BR'] ||
               listing._mstitle?.['en_US'] ||
               listing.internalName ||
               'Unnamed Property';

  // Extract address string
  const addressStr = listing.address
    ? `${listing.address.street || ''} ${listing.address.streetNumber || ''}, ${listing.address.region || ''}, ${listing.address.city || ''} - ${listing.address.stateCode || ''}`.trim()
    : '';

  return {
    staysListingId: listing._id,
    internalName: listing.internalName || listing.id || listing._id,
    name,
    address: addressStr,

    // Property details from API
    rooms: listing._i_rooms || 0,
    beds: listing._i_beds || 0,
    bathrooms: listing._f_bathrooms || 0,
    squareFeet: listing._f_square || null,
    maxGuests: listing._i_maxGuests || 0,

    // Amenities with translations (empty for now)
    amenities: [],

    // Media
    mainImage: listing._t_mainImageMeta?.url
      ? { url: listing._t_mainImageMeta.url, order: 0 }
      : null,
    images: listing._t_mainImageMeta?.url
      ? [{ url: listing._t_mainImageMeta.url, order: 0 }]
      : [],

    // Pricing (will be fetched separately)
    pricing: listing.deff_curr
      ? { currency: listing.deff_curr, basePricePerNight: 0 }
      : null,

    // Multilingual descriptions
    descriptions: listing._msdesc || {},

    // Custom fields (will be populated separately)
    customFields: {},

    // Location from API
    location: listing.latLng
      ? {
          latitude: listing.latLng._f_lat,
          longitude: listing.latLng._f_lng,
          city: listing.address?.city,
          state: listing.address?.state,
          country: listing.address?.countryCode,
          postalCode: listing.address?.zip,
        }
      : null,

    // Status
    active: listing.status === 'active',
    listed: listing.status === 'active',

    // Timestamps
    createdAt: now,
    updatedAt: now,
    syncedAt: now,
  };
}

/**
 * Fetch amenities reference data (cached for all properties)
 * Currently disabled - Stays.net API endpoint not working
 */
// async function fetchAmenitiesReference(): Promise<Map<string, StaysAmenity>> {
//   console.log('🎨 Fetching amenities reference...');
//   const amenities = await staysApiClient.getAmenities();
//
//   const amenitiesMap = new Map<string, StaysAmenity>();
//   amenities.forEach(amenity => amenitiesMap.set(amenity._id, amenity));
//
//   console.log(`✅ Loaded ${amenitiesMap.size} amenity types`);
//   return amenitiesMap;
// }

/**
 * Write properties to MongoDB using bulkWrite
 */
async function writePropertiesToMongo(
  properties: Omit<PropertyDocument, '_id'>[]
): Promise<number> {
  const collections = getCollections();
  if (properties.length === 0) return 0;

  const now = new Date();

  const operations = properties.map(property => {
    // Remove createdAt from property to avoid conflict with $setOnInsert
    const { createdAt, ...propertyWithoutCreatedAt } = property;

    return {
      updateOne: {
        filter: { staysListingId: property.staysListingId },
        update: {
          $set: {
            ...propertyWithoutCreatedAt,
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

  const result = await collections.properties.bulkWrite(operations as any);
  return result.upsertedCount + result.modifiedCount;
}

/**
 * Update property sync status
 */
async function updatePropertySyncStatus(
  status: 'success' | 'error' | 'running' | 'never',
  error: string | null = null,
  stats: { propertiesCount?: number; durationMs?: number } = {}
): Promise<void> {
  const now = new Date();
  const collections = getCollections();

  const updateData: any = {
    status,
    updatedAt: now,
  };

  if (status === 'success' || status === 'error') {
    updateData.lastSyncAt = now;
  }

  if (error !== null) {
    updateData.lastError = error;
  }

  if (stats.propertiesCount !== undefined) {
    updateData.propertiesCount = stats.propertiesCount;
  }

  if (stats.durationMs !== undefined) {
    updateData.durationMs = stats.durationMs;
  }

  await collections.propertySyncStatus.updateOne(
    { _id: 'current' } as any,
    { $set: updateData },
    { upsert: true }
  );
}

/**
 * Main property sync function
 */
export async function syncPropertiesData(): Promise<{
  success: boolean;
  propertiesCount: number;
  durationMs: number;
  error?: string;
}> {
  const startTime = Date.now();
  console.log('🏠 Starting property sync...');

  try {
    await updatePropertySyncStatus('running');

    // 1. Fetch amenities reference (needed for translations)
    // Temporarily skip amenities - we'll add them back once we figure out the correct endpoint
    // const amenitiesReference = new Map<string, StaysAmenity>();
    console.log('ℹ️ Skipping amenities fetch for now - will sync properties without translated amenities');

    // 2. Fetch all property listings with full details
    const listings = await staysApiClient.getAllEnhancedListings();

    if (listings.length === 0) {
      console.log('ℹ️ No properties found');
      const durationMs = Date.now() - startTime;
      await updatePropertySyncStatus('success', null, {
        propertiesCount: 0,
        durationMs
      });
      return { success: true, propertiesCount: 0, durationMs };
    }

    // 3. Transform listings to property documents
    const propertyDocuments = listings.map(listing =>
      transformPropertyDocument(listing)
    );

    // 4. Write to MongoDB
    const propertiesWritten = await writePropertiesToMongo(propertyDocuments);
    console.log(`💾 Wrote ${propertiesWritten} properties to MongoDB`);

    // 5. Update sync status
    const durationMs = Date.now() - startTime;
    await updatePropertySyncStatus('success', null, {
      propertiesCount: propertiesWritten,
      durationMs,
    });

    console.log(`✅ Property sync completed in ${durationMs}ms`);

    return {
      success: true,
      propertiesCount: propertiesWritten,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    console.error('❌ Property sync failed:', errorMessage);
    console.error('Full error details:', error);
    await updatePropertySyncStatus('error', errorMessage, { durationMs });

    return {
      success: false,
      propertiesCount: 0,
      durationMs,
      error: errorMessage,
    };
  }
}

/**
 * Get property sync status
 */
export async function getPropertySyncStatus(): Promise<{
  status: 'success' | 'error' | 'running' | 'never';
  lastSyncAt: Date | null;
  lastError: string | null;
  propertiesCount: number;
  durationMs: number;
  updatedAt: Date;
}> {
  const collections = getCollections();
  const doc = await collections.propertySyncStatus.findOne({ _id: 'current' } as any);

  if (!doc) {
    return {
      status: 'never',
      lastSyncAt: null,
      lastError: null,
      propertiesCount: 0,
      durationMs: 0,
      updatedAt: new Date(),
    };
  }

  return {
    status: doc.status || 'never',
    lastSyncAt: doc.lastSyncAt || null,
    lastError: doc.lastError || null,
    propertiesCount: doc.propertiesCount || 0,
    durationMs: doc.durationMs || 0,
    updatedAt: doc.updatedAt || new Date(),
  };
}
