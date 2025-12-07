import admin from 'firebase-admin';
import { config } from './env.js';

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: config.firebase.projectId,
      clientEmail: config.firebase.clientEmail,
      privateKey: config.firebase.privateKey,
    }),
  });
  console.log('🔥 Firebase Admin SDK initialized for project:', config.firebase.projectId);
}

export const db = admin.firestore();

// Collection references
export const collections = {
  listings: db.collection('stays_listings'),
  reservations: db.collection('stays_reservations'),
  unifiedBookings: db.collection('stays_unified_bookings'),
  syncStatus: db.collection('stays_sync_status'),
};

// Firestore timestamp helper
export const FieldValue = admin.firestore.FieldValue;
export const Timestamp = admin.firestore.Timestamp;
