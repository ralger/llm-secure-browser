import { BrowserContext, Page } from 'playwright';
import { ICredentialProvider } from '../../../core/credentials/index.js';
import { MCAS_CONFIG } from '../config.js';
import {
  ClassInfo,
  ChildClassesInfo,
  ClassesResult,
  TimetableWeek,
} from '../types.js';
import {
  withFreshSession,
  switchChild,
  callProxyHtml,
} from './login.action.js';
import { TimetablePage } from '../pages/timetable.page.js';

const { students } = MCAS_CONFIG;

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Returns the full class list and current week timetable for all children.
 *
 * This data changes rarely (once per term at most), so callers should cache
 * the result and only refresh infrequently.
 *
 * - Class list: MCAS dashboard widget API (fast, no page navigation)
 * - Timetable: timetable page scrape (requires child context switch per student)
 */
export function getClasses(
  credentialProvider: ICredentialProvider,
): Promise<ClassesResult> {
  return withFreshSession(credentialProvider, (page, context) => _getClasses(page, context));
}

// ── Implementation ────────────────────────────────────────────────────────────

async function _getClasses(page: Page, context: BrowserContext): Promise<ClassesResult> {
  const childResults: ChildClassesInfo[] = [];

  for (const student of students) {
    // ── Classes: API proxy ────────────────────────────────────────────────────
    const classesHtml = await callProxyHtml(
      page,
      `api/v1/mcas/dashboard/GetClassListWidgetData/${student.studentId}`,
    );
    const classes = await parseClassList(page, classesHtml);

    // ── Timetable: page scrape with child context switch ──────────────────────
    const ttPage = await context.newPage();
    const timetablePage = new TimetablePage(ttPage);
    await switchChild(ttPage, student.studentId);
    await timetablePage.navigate();
    const timetable: TimetableWeek = await timetablePage.getTimetable();
    await ttPage.close().catch(() => {});

    childResults.push({
      name: student.name,
      studentId: student.studentId,
      classes,
      timetable,
    });
  }

  return {
    fetchedAt: new Date().toISOString(),
    children: childResults,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parses the HTML table returned by GetClassListWidgetData.
 *
 * Table structure:
 *   <thead><tr><th>Class Name</th><th>Class Details</th></tr></thead>
 *   <tbody>
 *     <tr>
 *       <td title="7A/Hi">7A/Hi</td>
 *       <td><div class="mcas-text">History</div> <span>Mr D Horne</span></td>
 *     </tr>
 *   </tbody>
 */
async function parseClassList(page: Page, html: string): Promise<ClassInfo[]> {
  return page.evaluate((htmlStr: string) => {
    const div = document.createElement('div');
    div.innerHTML = htmlStr;
    const rows = Array.from(div.querySelectorAll('tbody tr'));
    return rows.map((row) => {
      const cells = row.querySelectorAll('td');
      const code = cells[0]?.getAttribute('title') ?? cells[0]?.textContent?.trim() ?? '';
      const detailsCell = cells[1];
      const subject = detailsCell?.querySelector('.mcas-text')?.textContent?.trim() ?? '';
      // Teacher is in the last text node / span after the subject div
      const teacher =
        detailsCell?.querySelector('span')?.textContent?.trim() ??
        (detailsCell?.textContent ?? '')
          .replace(subject, '')
          .trim()
          .replace(/\s+/g, ' ') ??
        '';
      return { code, subject, teacher };
    });
  }, html);
}
