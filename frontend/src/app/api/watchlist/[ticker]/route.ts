import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, updateDoc, arrayRemove } from 'firebase/firestore';
import { getUserIdFromRequest } from '@/lib/auth';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const resolvedParams = await params;
    const ticker = resolvedParams.ticker.toUpperCase().trim();
    console.log(`[API Remove Watchlist] Removing ${ticker} for user ${userId}`);

    // Basic symbol format validation
    if (!ticker || ticker.length > 10 || !/^[A-Z]+$/.test(ticker)) {
      return NextResponse.json(
        { success: false, error: 'Invalid ticker symbol', message: 'Ticker symbol must be 1-10 uppercase letters.' },
        { status: 400 }
      );
    }

    const userRef = doc(db, 'users', userId);
    
    // Remove from watchlist using arrayRemove
    await updateDoc(userRef, {
      watchlist: arrayRemove(ticker)
    });

    return NextResponse.json({
      success: true,
      message: `'${ticker}' removed from your watchlist.`,
      data: { ticker }
    });
  } catch (error: any) {
    console.error('[API Remove Watchlist] Error removing from watchlist:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to remove from watchlist', message: error.message },
      { status: 500 }
    );
  }
}
