"use client";

import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from "firebase/auth";

// Values here are all public (Firebase web config is meant to be exposed to
// the client - it's the security rules on the Firebase project, plus our own
// server-side ID token verification, that actually gate access).
const firebaseConfig = {
  apiKey: "AIzaSyDRZe3GqtoGEA06YLsackq19Q6LWl5fwB4",
  authDomain: "let-s-yap-b7348.firebaseapp.com",
  projectId: "let-s-yap-b7348",
  storageBucket: "let-s-yap-b7348.firebasestorage.app",
  messagingSenderId: "544635318064",
  appId: "1:544635318064:web:2e01570c28cad5c76062f5"
};

// getApps()/getApp() guard avoids "Firebase App named '[DEFAULT]' already
// exists" during Next.js hot reload in dev.
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  return result.user.getIdToken();
}

export async function registerWithFirebaseEmail(email, password) {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  return result.user.getIdToken();
}

export async function signInWithFirebaseEmail(email, password) {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user.getIdToken();
}
