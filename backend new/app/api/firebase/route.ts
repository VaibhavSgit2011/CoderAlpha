// src/app/api/firebase/save/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, doc, setDoc, Timestamp } from 'firebase/firestore';

export async function POST(request: NextRequest) {
  try {
    const { userId, ticker, data } = await request.json();

    if (!userId || !ticker || !data) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Save to Firebase Firestore
    const tickerRef = collection(db, 'users', userId, 'tickers');
    await setDoc(doc(tickerRef, ticker), {
      ...data,
      lastUpdated: Timestamp.now(),
    });

    // Also save to global tickers collection for analytics
    const globalTickerRef = collection(db, 'tickers');
    await setDoc(
      doc(globalTickerRef, ticker),
      {
        symbol: ticker,
        lastUpdated: Timestamp.now(),
        sentiment: data.sentiment || 0,
        price: data.price || 0,
        change: data.change || 0,
        percentChange: data.percentChange || 0,
      },
      { merge: true }
    );

    return NextResponse.json({
      success: true,
      message: 'Data saved successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Firebase save error:', error);
    return NextResponse.json(
      { error: 'Failed to save data' },
      { status: 500 }
    );
  }
}

// src/app/api/firebase/ticker/route.ts
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const ticker = searchParams.get('ticker');

    if (!userId || !ticker) {
      return NextResponse.json(
        { error: 'Missing userId or ticker' },
        { status: 400 }
      );
    }

    // In production, fetch from Firebase
    // For now, return mock data
    return NextResponse.json({
      success: true,
      userId,
      ticker,
      data: {
        symbol: ticker,
        sentiment: Math.floor(Math.random() * 100),
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Firebase fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch data' },
      { status: 500 }
    );
  }
}
