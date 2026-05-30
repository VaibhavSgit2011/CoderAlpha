import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getUserIdFromRequest } from '@/lib/auth';

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

export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log(`[API Get Reports] Fetching reports for user ${userId}`);
    const reportsRef = collection(db, 'reports');
    const reportsQuery = query(reportsRef, where('requested_by', '==', userId));
    const querySnapshot = await getDocs(reportsQuery);
    
    const reports = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        generated_at: safeFormatTimestamp(data.generated_at),
        reportId: doc.id,
        report_id: doc.id
      };
    });

    // Sort by generated_at descending (newest first)
    reports.sort((a: any, b: any) => {
      const timeA = a.generated_at ? new Date(a.generated_at).getTime() : 0;
      const timeB = b.generated_at ? new Date(b.generated_at).getTime() : 0;
      return timeB - timeA;
    });

    return NextResponse.json({
      success: true,
      count: reports.length,
      data: reports
    });
  } catch (error: any) {
    console.error('[API Get Reports] Error fetching reports:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch reports' },
      { status: 500 }
    );
  }
}
