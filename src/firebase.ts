import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { readFileSync } from 'fs';

// Load environment variables (ensure dotenv is called early if needed)
import dotenv from 'dotenv';
dotenv.config();  // 👈 Add this line if not loaded globally

const serviceAccount = JSON.parse(
  readFileSync('firebase-service-account.json', 'utf-8')
);

const app = initializeApp({
  credential: cert(serviceAccount),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET
});

export const bucket = getStorage().bucket();  // uses default bucket from init
