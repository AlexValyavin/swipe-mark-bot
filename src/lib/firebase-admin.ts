import "server-only";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

let cachedApp: ReturnType<typeof initializeApp> | null = null;

function getAdminApp() {
  if (cachedApp) return cachedApp;
  if (getApps().length) {
    cachedApp = getApps()[0];
    return cachedApp;
  }

  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!key) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is not set");
  }

  const serviceAccount = JSON.parse(key);
  cachedApp = initializeApp({ credential: cert(serviceAccount) });
  return cachedApp;
}

export function getAdminDb() {
  return getFirestore(getAdminApp());
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}