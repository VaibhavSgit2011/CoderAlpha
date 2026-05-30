import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { getUserIdFromRequest } from '@/lib/auth';
import { startNewsIngestionWorker } from '@/lib/newsWorker';

function safeFormatTimestamp(timestamp: any, fallbackToNow = true): string | null {
  if (!timestamp) return fallbackToNow ? new Date().toISOString() : null;
  if (typeof timestamp === 'string') return timestamp;
  if (typeof timestamp.toDate === 'function') {
    try {
      return timestamp.toDate().toISOString();
    } catch (e) {}
  }
  const secs = timestamp.seconds !== undefined ? timestamp.seconds : timestamp._seconds;
  if (secs !== undefined && secs !== null) {
    try {
      return new Date(secs * 1000).toISOString();
    } catch (e) {}
  }
  return fallbackToNow ? new Date().toISOString() : null;
}

const DEFAULT_TICKERS = [
  { ticker_symbol: 'AAPL', symbol: 'AAPL', current_sentiment_score: 75, sentiment: 75, price: 189.95, change: 2.45 },
  { ticker_symbol: 'GOOGL', symbol: 'GOOGL', current_sentiment_score: 72, sentiment: 72, price: 140.23, change: 1.82 },
  { ticker_symbol: 'MSFT', symbol: 'MSFT', current_sentiment_score: 78, sentiment: 78, price: 378.91, change: 3.15 },
  { ticker_symbol: 'TSLA', symbol: 'TSLA', current_sentiment_score: 58, sentiment: 58, price: 242.84, change: -5.23 },
  { ticker_symbol: 'NVDA', symbol: 'NVDA', current_sentiment_score: 82, sentiment: 82, price: 875.28, change: 12.45 }
];

export async function GET(request: NextRequest) {
  // Boot the background news ingestion worker (which continuously saves news and quotes to Firestore)
  startNewsIngestionWorker();

  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const querySnapshot = await getDocs(collection(db, 'tickers'));
    const tickers = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        symbol: doc.id,
        ticker_symbol: doc.id,
        price: data.price || 150.00,
        change: data.change || 0.00,
        current_sentiment_score: data.current_sentiment_score || 50,
        sentiment: data.sentiment || data.current_sentiment_score || 50,
        recent_news: data.recent_news || [],
        status: data.status || 'active',
        last_updated: safeFormatTimestamp(data.last_updated, false)
      };
    });

    if (tickers.length === 0) {
      console.log('[API Tickers] Firestore is empty. Seeding defaults...');
      // Seed DEFAULT_TICKERS to Firestore
      for (const t of DEFAULT_TICKERS) {
        await setDoc(doc(db, 'tickers', t.symbol), {
          ...t,
          recent_news: [],
          status: 'active'
        }, { merge: true });
      }

      return NextResponse.json({
        success: true,
        count: DEFAULT_TICKERS.length,
        data: DEFAULT_TICKERS
      });
    }

    return NextResponse.json({
      success: true,
      count: tickers.length,
      data: tickers
    });
  } catch (err: any) {
    console.warn('[API Tickers] Failed to load tickers from Firestore, falling back to mock data:', err.message);
    return NextResponse.json({
      success: true,
      count: DEFAULT_TICKERS.length,
      data: DEFAULT_TICKERS
    });
  }
}
