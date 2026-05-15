/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

let firebaseConfig;
try {
  // @ts-ignore
  firebaseConfig = await import("../../firebase-applet-config.json").then(m => m.default);
} catch (e) {
  console.warn("Firebase config not found. Firebase features will be disabled.");
}

const app = !getApps().length ? (firebaseConfig ? initializeApp(firebaseConfig) : null) : getApp();

export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app, firebaseConfig?.firestoreDatabaseId) : null;

export const isFirebaseEnabled = !!app;
