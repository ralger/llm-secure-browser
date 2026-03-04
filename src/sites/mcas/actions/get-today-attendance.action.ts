import { Page } from 'playwright';
import { ICredentialProvider } from '../../../core/credentials/index.js';
import { MCAS_CONFIG } from '../config.js';
import {
  ChildTodayAttendance,
  AttendanceMark,
  TodayAttendanceResult,
} from '../types.js';
import {
  withFreshSession,
  callProxyHtml,
  parseHtmlTableCells,
} from './login.action.js';

const { students } = MCAS_CONFIG;

/**
 * Returns today's AM and PM attendance register marks for all children.
 *
 * Uses the MCAS dashboard attendance widget API — no page navigation needed,
 * making this the fastest available endpoint.
 */
export function getTodayAttendance(
  credentialProvider: ICredentialProvider,
): Promise<TodayAttendanceResult> {
  return withFreshSession(credentialProvider, (page) => _getTodayAttendance(page));
}

async function _getTodayAttendance(page: Page): Promise<TodayAttendanceResult> {
  const childResults: ChildTodayAttendance[] = [];

  for (const student of students) {
    const html = await callProxyHtml(
      page,
      `api/v1/mcas/dashboard/GetAttendanceWidgetData/${student.studentId}/-1`,
    );

    const rows = await parseHtmlTableCells(page, html);

    let am: AttendanceMark | null = null;
    let pm: AttendanceMark | null = null;

    for (const row of rows) {
      if (row.length < 3) continue;
      const period = row[0]?.text ?? '';
      const subject = row[1]?.text ?? '';
      const status = row[2]?.title || row[2]?.text || 'Unknown';

      if (period === 'AM') {
        am = { status, subject };
      } else if (period === 'PM') {
        pm = { status, subject };
      }
    }

    childResults.push({ name: student.name, studentId: student.studentId, am, pm });
  }

  return {
    fetchedAt: new Date().toISOString(),
    children: childResults,
  };
}
