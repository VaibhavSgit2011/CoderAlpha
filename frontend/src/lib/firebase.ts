import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAnalytics, isSupported, type Analytics } from 'firebase/analytics';
import {
  getFirestore,
  type Firestore,
  collection,
  query,
  orderBy,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  type FieldValue,
} from 'firebase/firestore';
import {
  getAuth,
  type Auth,
  onAuthStateChanged,
  type User,
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db: Firestore = getFirestore(app);
const auth: Auth = getAuth(app);

let analytics: Analytics | null = null;
if (typeof window !== 'undefined') {
  void isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  });
}

export { db, auth, analytics };
export type { FirebaseApp, Firestore, Auth, User, FieldValue };

export const watchlistQuery = (userId: string) =>
  query(collection(db, 'users', userId, 'watchlist'), orderBy('addedAt', 'desc'));

export const tickerDoc = (ticker: string) => doc(db, 'tickers', ticker);
export const reportDoc = (reportId: string) => doc(db, 'reports', reportId);
export const userDoc = (userId: string) => doc(db, 'users', userId);

export const authStateChange = (callback: (user: User | null) => void) =>
  onAuthStateChanged(auth, callback);

export const signIn = (email: string, password: string) =>
  signInWithEmailAndPassword(auth, email, password);

export const signUp = (email: string, password: string) =>
  createUserWithEmailAndPassword(auth, email, password);

export const logOut = () => signOut(auth);

export const signInWithGoogle = () => {
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
};

export const signInWithApple = () => {
  const provider = new OAuthProvider('apple.com');
  return signInWithPopup(auth, provider);
};

export const addToWatchlist = async (
  userId: string,
  tickerData: {
    ticker: string;
    addedAt: FieldValue;
  }
) => {
  const watchlistRef = collection(db, 'users', userId, 'watchlist');
  return addDoc(watchlistRef, tickerData);
};

export const removeFromWatchlist = async (userId: string, watchlistItemId: string) => {
  const watchlistItemRef = doc(db, 'users', userId, 'watchlist', watchlistItemId);
  return deleteDoc(watchlistItemRef);
};

export const updateTicker = async (
  ticker: string,
  data: Partial<{
    current_sentiment_score: number;
    last_updated: FieldValue;
    recent_news: Array<{ title: string; url: string; ai_summary: string; source: string }>;
  }>
) => {
  const tickerRef = tickerDoc(ticker);
  return updateDoc(tickerRef, data);
};

export const addReport = async (reportData: {
  ticker_symbol: string;
  generated_at: FieldValue;
  requested_by: string;
  content: {
    strengths: string[];
    weaknesses: string[];
    catalysts: string[];
    overall_thesis: string;
  };
}) => {
  const reportsRef = collection(db, 'reports');
  return addDoc(reportsRef, reportData);
};