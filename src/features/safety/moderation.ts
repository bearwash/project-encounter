import { getDb } from '@/lib/db/client';
import { getSupabase } from '@/lib/supabase/client';
import { isTauri } from '@/lib/tauri/env';
import type { HistoryItem } from '@/types/encounter';

export type ReportReason =
  | 'harassment'
  | 'hate'
  | 'sexual'
  | 'personal_info'
  | 'spam'
  | 'other';

export const REPORT_REASONS: ReadonlyArray<{ value: ReportReason; label: string }> = [
  { value: 'harassment', label: '嫌がらせ・暴言' },
  { value: 'hate', label: '差別・ヘイト' },
  { value: 'sexual', label: '性的・不適切' },
  { value: 'personal_info', label: '個人情報' },
  { value: 'spam', label: '宣伝・スパム' },
  { value: 'other', label: 'その他' },
] as const;

type BrowserSafetyState = {
  blockedUserIds: string[];
  reports: Array<{
    id: string;
    reporterId: string;
    reportedUserId: string;
    displayNameSnapshot?: string;
    messageSnapshot?: string;
    reason: ReportReason;
    createdAt: number;
    status?: 'pending' | 'sent';
  }>;
};

const STORAGE_KEY = 'project-encounter:safety:v1';

export async function loadBlockedUserIds(): Promise<Set<string>> {
  if (!isTauri()) return new Set(readBrowserState().blockedUserIds);
  const db = await getDb();
  const rows = await db.select<Array<{ user_id: string }>>('SELECT user_id FROM blocked_users');
  return new Set(rows.map((row) => row.user_id));
}

export async function blockUser(userId: string): Promise<void> {
  if (isTauri()) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO blocked_users (user_id, blocked_at)
       VALUES ($1, $2)
       ON CONFLICT(user_id) DO UPDATE SET blocked_at = excluded.blocked_at`,
      [userId, Math.floor(Date.now() / 1000)],
    );
    return;
  }

  const state = readBrowserState();
  if (!state.blockedUserIds.includes(userId)) state.blockedUserIds.push(userId);
  writeBrowserState(state);
}

export async function submitContentReport({
  reporterId,
  resident,
  reason,
  testMode,
}: {
  reporterId: string;
  resident: HistoryItem;
  reason: ReportReason;
  testMode: boolean;
}): Promise<{ delivered: boolean }> {
  const id = crypto.randomUUID();
  const createdAt = Math.floor(Date.now() / 1000);

  if (isTauri()) {
    const db = await getDb();
    await db.execute(
      `INSERT INTO content_reports
         (report_id, reporter_id, reported_user_id, display_name_snapshot,
          message_snapshot, reason, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)`,
      [
        id,
        reporterId,
        resident.user_id,
        resident.display_name,
        resident.message,
        reason,
        createdAt,
      ],
    );
  } else {
    const state = readBrowserState();
    state.reports.push({
      id,
      reporterId,
      reportedUserId: resident.user_id,
      displayNameSnapshot: resident.display_name,
      messageSnapshot: resident.message,
      reason,
      createdAt,
      status: 'pending',
    });
    writeBrowserState(state);
  }

  if (testMode) {
    await markReportSent(id);
    return { delivered: true };
  }

  const delivered = await uploadContentReport({
    id,
    reporterId,
    reportedUserId: resident.user_id,
    displayNameSnapshot: resident.display_name,
    messageSnapshot: resident.message,
    reason,
  });
  if (delivered) await markReportSent(id);
  return { delivered };
}

/** ネットワーク不通時に端末へ残った通報を、次回の認証済み起動で再送する。 */
export async function flushPendingContentReports(reporterId: string): Promise<number> {
  const pending = await loadPendingReports(reporterId);
  let deliveredCount = 0;

  for (const report of pending) {
    const delivered = await uploadContentReport(report);
    if (!delivered) continue;
    await markReportSent(report.id);
    deliveredCount += 1;
  }

  return deliveredCount;
}

type PendingReport = {
  id: string;
  reporterId: string;
  reportedUserId: string;
  displayNameSnapshot: string;
  messageSnapshot: string;
  reason: ReportReason;
};

async function loadPendingReports(reporterId: string): Promise<PendingReport[]> {
  if (isTauri()) {
    const db = await getDb();
    const rows = await db.select<Array<{
      report_id: string;
      reporter_id: string;
      reported_user_id: string;
      display_name_snapshot: string;
      message_snapshot: string;
      reason: ReportReason;
    }>>(
      `SELECT report_id, reporter_id, reported_user_id, display_name_snapshot,
              message_snapshot, reason
         FROM content_reports
        WHERE reporter_id = $1 AND status = 'pending'
        ORDER BY created_at`,
      [reporterId],
    );
    return rows.map((row) => ({
      id: row.report_id,
      reporterId: row.reporter_id,
      reportedUserId: row.reported_user_id,
      displayNameSnapshot: row.display_name_snapshot,
      messageSnapshot: row.message_snapshot,
      reason: row.reason,
    }));
  }

  return readBrowserState().reports
    .filter((report) => report.reporterId === reporterId && report.status !== 'sent')
    .map((report) => ({
      id: report.id,
      reporterId: report.reporterId,
      reportedUserId: report.reportedUserId,
      displayNameSnapshot: report.displayNameSnapshot || '旅人',
      messageSnapshot: report.messageSnapshot || '',
      reason: report.reason,
    }));
}

async function uploadContentReport(report: PendingReport): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;

  const { error } = await sb.from('content_reports').insert({
    id: report.id,
    reporter_id: report.reporterId,
    reported_user_id: report.reportedUserId,
    display_name_snapshot: report.displayNameSnapshot,
    message_snapshot: report.messageSnapshot,
    reason: report.reason,
  });
  if (!error || error.code === '23505') return true;

  console.warn('[moderation] report upload pending:', error.message);
  return false;
}

async function markReportSent(reportId: string): Promise<void> {
  if (isTauri()) {
    const db = await getDb();
    await db.execute("UPDATE content_reports SET status = 'sent' WHERE report_id = $1", [reportId]);
    return;
  }

  const state = readBrowserState();
  const report = state.reports.find((item) => item.id === reportId);
  if (report) report.status = 'sent';
  writeBrowserState(state);
}

function readBrowserState(): BrowserSafetyState {
  if (typeof window === 'undefined') return { blockedUserIds: [], reports: [] };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<BrowserSafetyState>;
    return {
      blockedUserIds: Array.isArray(parsed.blockedUserIds)
        ? parsed.blockedUserIds.filter((id): id is string => typeof id === 'string')
        : [],
      reports: Array.isArray(parsed.reports) ? parsed.reports : [],
    };
  } catch {
    return { blockedUserIds: [], reports: [] };
  }
}

function writeBrowserState(state: BrowserSafetyState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
