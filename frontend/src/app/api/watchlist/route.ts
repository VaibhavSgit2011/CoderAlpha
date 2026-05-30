import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { getUserIdFromRequest } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log(`[API Get Watchlist] Fetching watchlist for user ${userId}`);
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      return NextResponse.json({
        success: true,
        count: 0,
        data: []
      });
    }

    const userData = userSnap.data();
    const watchlist = Array.isArray(userData?.watchlist) ? userData.watchlist : [];

    return NextResponse.json({
      success: true,
      count: watchlist.length,
      data: watchlist
    });
  } catch (error: any) {
    console.error('[API Get Watchlist] Error fetching watchlist:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch watchlist' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { ticker } = await request.json();
    if (!ticker) {
      return NextResponse.json({ error: 'Missing ticker' }, { status: 400 });
    }

    const upperTicker = ticker.toUpperCase().trim();
    console.log(`[API Add Watchlist] Adding ${upperTicker} for user ${userId}`);

    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    // Check duplicates
    if (userSnap.exists()) {
      const userData = userSnap.data();
      const currentWatchlist = Array.isArray(userData?.watchlist) ? userData.watchlist : [];
      if (currentWatchlist.includes(upperTicker)) {
        return NextResponse.json(
          { success: false, error: 'Duplicate ticker', message: `'${upperTicker}' is already in your watchlist.` },
          { status: 409 }
        );
      }
    }

    // Add to watchlist using arrayUnion
    await setDoc(
      userRef,
      { watchlist: arrayUnion(upperTicker) },
      { merge: true }
    );

    // Ensure skeleton ticker exists in global tickers collection
    const tickerRef = doc(db, 'tickers', upperTicker);
    const tickerSnap = await getDoc(tickerRef);
    if (!tickerSnap.exists()) {
      await setDoc(
        tickerRef,
        {
          ticker_symbol: upperTicker,
          symbol: upperTicker,
          current_sentiment_score: 50,
          sentiment: 50,
          recent_news: [],
          status: 'pending'
        },
        { merge: true }
      );
      console.log(`[API Add Watchlist] Created skeleton document for new ticker ${upperTicker}`);
    }

    return NextResponse.json({
      success: true,
      message: `'${upperTicker}' added to your watchlist.`,
      data: { ticker: upperTicker }
    }, { status: 201 });

  } catch (error: any) {
    console.error('[API Add Watchlist] Error adding to watchlist:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to add to watchlist', message: error.message },
      { status: 500 }
    );
  }
}
