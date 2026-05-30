import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const resolvedParams = await params;
    const reportId = resolvedParams.id;
    console.log(`[API Get Report Detail] Fetching report ${reportId} for user ${userId}`);

    const reportRef = doc(db, 'reports', reportId);
    const reportSnap = await getDoc(reportRef);

    if (!reportSnap.exists()) {
      return NextResponse.json(
        { success: false, error: 'Report not found', message: `No report found with ID '${reportId}'.` },
        { status: 404 }
      );
    }

    const report = reportSnap.data();

    // Verify ownership: requested_by must match currently logged in user ID
    if (report.requested_by !== userId) {
      console.warn(`[API Get Report Detail] Access denied for user ${userId} to report owned by ${report.requested_by}`);
      return NextResponse.json(
        { success: false, error: 'Forbidden', message: 'You do not have permission to view this report.' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ...report,
        generated_at: safeFormatTimestamp(report.generated_at),
        reportId: reportSnap.id,
        report_id: reportSnap.id
      }
    });
  } catch (error: any) {
    console.error('[API Get Report Detail] Error fetching report detail:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch report detail' },
      { status: 500 }
    );
  }
}
