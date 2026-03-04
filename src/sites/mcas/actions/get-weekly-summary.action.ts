import { BrowserContext, Page } from 'playwright';
import { ICredentialProvider } from '../../../core/credentials/index.js';
import { MCAS_CONFIG } from '../config.js';
import {
  BehaviourEvent,
  Detention,
  ChildWeeklySummary,
  DailyAttendance,
  WeeklySummaryResult,
} from '../types.js';
import {
  withFreshSession,
  switchChild,
  callProxyHtml,
  callProxyJson,
  parseHtmlTableCells,
} from './login.action.js';
import { AttendancePage } from '../pages/attendance.page.js';

const { students, currentYearId } = MCAS_CONFIG;

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Returns a 7-day summary for all children containing:
 * - Daily attendance marks (from the attendance calendar page)
 * - Behaviour events per weekday (via MCAS API proxy)
 * - Detentions (via MCAS API proxy, filtered to the 7-day window)
 */
export function getWeeklySummary(
  credentialProvider: ICredentialProvider,
): Promise<WeeklySummaryResult> {
  return withFreshSession(credentialProvider, (page, context) => _getWeeklySummary(page, context));
}

// ── Implementation ────────────────────────────────────────────────────────────

async function _getWeeklySummary(page: Page, context: BrowserContext): Promise<WeeklySummaryResult> {

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Build window: today and the 6 preceding calendar days
  const last7Days = getLast7Days(today);
  const weekFrom = last7Days[0];
  const weekTo = last7Days[last7Days.length - 1];

  // Weekdays only (Mon–Fri) for behaviour API calls
  const weekdays = last7Days.filter((d) => {
    const day = new Date(d).getDay();
    return day >= 1 && day <= 5;
  });

  const childResults: ChildWeeklySummary[] = [];

  for (let i = 0; i < students.length; i++) {
    const student = students[i];

    // ── Attendance: page scrape (requires child context switch) ──────────────
    const attPage = await context.newPage();
    const attendancePage = new AttendancePage(attPage);
    await switchChild(attPage, student.studentId);
    await attendancePage.navigate();
    const attendance = await attendancePage.getDailyAttendance(last7Days);
    await attPage.close().catch(() => {});

    // ── Behaviour: per-weekday API calls ─────────────────────────────────────
    const behaviour = await getBehaviourForDays(page, student.studentId, weekdays);

    // ── Detentions: single API call, filter to window ─────────────────────────
    const detentions = await getDetentionsInWindow(page, student.studentId, weekFrom, weekTo);

    childResults.push({
      name: student.name,
      studentId: student.studentId,
      attendance,
      behaviour,
      detentions,
    });

    // Human-like delay between children
    if (i < students.length - 1) await delay(1500, 500);
  }

  return {
    fetchedAt: new Date().toISOString(),
    weekFrom,
    weekTo,
    children: childResults,
  };
}

// ── Behaviour ─────────────────────────────────────────────────────────────────

async function getBehaviourForDays(
  page: Page,
  studentId: number,
  isoDates: string[],
): Promise<BehaviourEvent[]> {
  const events: BehaviourEvent[] = [];

  for (const isoDate of isoDates) {
    const [year, month, day] = isoDate.split('-').map(Number);
    const apiUrl = `api/v1/eventRecords/mcas/eventstable/${studentId}/${currentYearId}/${year}/${month}/${day}/-1`;

    let html: string;
    try {
      html = await callProxyHtml(page, apiUrl);
    } catch {
      // No events for this day (proxy returns 404-style or empty)
      continue;
    }

    if (!html || html.includes('no data') || html.length < 20) continue;

    const rows = await parseHtmlTableCells(page, html);

    for (const row of rows) {
      if (row.length < 5) continue;

      // HTML table columns: Date, Class, Subject, Teacher, Event
      const dateText = row[0]?.text ?? '';
      const classCode = row[1]?.text ?? '';
      const subject = row[2]?.text ?? '';
      const teacher = row[3]?.text ?? '';
      const eventText = row[4]?.text ?? '';
      const eventClasses = row[4]?.classes ?? '';

      // Determine type from FontAwesome icon class
      const type = eventClasses.includes('fa-check-circle') ? 'positive' : 'negative';

      // Convert date from "DD/MM/YYYY" to ISO "YYYY-MM-DD"
      const isoEventDate = parseMcasDate(dateText) ?? isoDate;

      events.push({ date: isoEventDate, type, event: eventText, class: classCode, subject, teacher });
    }

    await delay(300, 200);
  }

  return events;
}

// ── Detentions ────────────────────────────────────────────────────────────────

interface McasDetentionRecord {
  Date: string;
  DetentionType: string;
  Session: string;
  Times: string;
  Subject: string;
  Teacher: string;
  DetentionTrigger: string;
  Room: string;
  Attended: string;
  Comment: string;
}

interface McasDetentionsResponse {
  Detention: McasDetentionRecord[];
}

async function getDetentionsInWindow(
  page: Page,
  studentId: number,
  weekFrom: string,
  weekTo: string,
): Promise<Detention[]> {
  let data: McasDetentionsResponse;
  try {
    data = await callProxyJson<McasDetentionsResponse>(
      page,
      `api/v1/detentions/mcas/${studentId}`,
    );
  } catch {
    return [];
  }

  const from = new Date(weekFrom).getTime();
  const to = new Date(weekTo).getTime() + 86400000; // inclusive end

  return (data.Detention ?? [])
    .filter((d) => {
      const t = parseMcasDateToTime(d.Date);
      return t !== null && t >= from && t < to;
    })
    .map((d) => ({
      date: d.Date,
      type: d.DetentionType,
      session: d.Session,
      times: d.Times,
      subject: d.Subject,
      teacher: d.Teacher,
      room: d.Room,
      attended: d.Attended?.toLowerCase() === 'yes',
      comment: d.Comment ?? '',
    }));
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Returns array of ISO date strings for today and the 6 preceding days, ascending. */
function getLast7Days(today: Date): string[] {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

/** Converts MCAS "DD/MM/YYYY" date string to ISO "YYYY-MM-DD", or null if invalid. */
function parseMcasDate(dateStr: string): string | null {
  const m = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Converts MCAS "DD/MM/YYYY" to timestamp (ms since epoch), or null. */
function parseMcasDateToTime(dateStr: string): number | null {
  const iso = parseMcasDate(dateStr);
  if (!iso) return null;
  return new Date(iso).getTime();
}

function delay(baseMs: number, jitterMs: number): Promise<void> {
  return new Promise((resolve) =>
    setTimeout(resolve, baseMs + Math.floor(Math.random() * jitterMs)),
  );
}
