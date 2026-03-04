import { Page } from 'playwright';
import { MCAS_CONFIG } from '../config.js';
import { TimetablePeriod, TimetableWeek } from '../types.js';

const { timetableUrl } = MCAS_CONFIG;

/**
 * Page Object Model for the MCAS timetable page.
 * URL: /MCAS/MCSTimetable.aspx
 *
 * The page renders a server-side HTML table for the current week.
 * Rows = periods (AM, 1–5, AS); columns = days (Mon–Fri).
 * Each cell contains: period label, school name, subject, class code, teacher.
 *
 * NOTE: Switch child context before calling navigate() so the page renders
 * the correct student's timetable.
 */
export class TimetablePage {
  constructor(private readonly page: Page) {}

  async navigate(): Promise<void> {
    await this.page.goto(timetableUrl, { waitUntil: 'networkidle' });
  }

  /**
   * Scrapes and returns the current week's timetable.
   */
  async getTimetable(): Promise<TimetableWeek> {
    return this.page.evaluate(() => {
      // ── Find the timetable table by its ID ────────────────────────────────
      const table = document.querySelector<HTMLTableElement>('#MainContent_TableTT');
      if (!table) return { weekCommencing: '', periods: [] };

      // ── Extract week commencing date from the dropdown ────────────────────
      const weekSelect = document.querySelector<HTMLSelectElement>('#MainContent_SelectWeek');
      let weekCommencing = '';
      if (weekSelect?.value) {
        // Value is "DD/MM/YYYY" — convert to ISO
        const [dd, mm, yyyy] = weekSelect.value.split('/');
        weekCommencing = `${yyyy}-${mm}-${dd}`;
      }

      // ── Parse body rows ───────────────────────────────────────────────────
      // Structure: 5 columns (Mon-Fri), NO period-label column.
      // Period label is the first <div> text inside each cell.
      // Cell div order: [period, school, subject, classCode, teacher]
      const rows = Array.from(table.querySelectorAll('tbody tr'));
      const days: Array<'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday'> = [
        'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
      ];

      const periods: Array<{
        period: string;
        monday: { subject: string; classCode: string; teacher: string } | null;
        tuesday: { subject: string; classCode: string; teacher: string } | null;
        wednesday: { subject: string; classCode: string; teacher: string } | null;
        thursday: { subject: string; classCode: string; teacher: string } | null;
        friday: { subject: string; classCode: string; teacher: string } | null;
      }> = [];

      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll('td'));
        if (cells.length === 0) continue;

        // Extract period label from first cell's first div
        const firstCellDivs = Array.from(cells[0]?.querySelectorAll('div') ?? []);
        const periodLabel = firstCellDivs[0]?.textContent?.trim() ?? '';

        const periodRow: (typeof periods)[0] = {
          period: periodLabel,
          monday: null, tuesday: null, wednesday: null, thursday: null, friday: null,
        };

        // Each cell has 5 divs: [period, school, subject, classCode, teacher]
        for (let i = 0; i < 5; i++) {
          const cell = cells[i];
          if (!cell) continue;
          const divs = Array.from(cell.querySelectorAll('div'));
          if (divs.length < 5) continue;
          // Use title attribute for clean values (subject div may not have it, use textContent)
          const subject = divs[2]?.getAttribute('title') ?? divs[2]?.textContent?.trim() ?? '';
          const classCode = divs[3]?.getAttribute('title') ?? divs[3]?.textContent?.trim() ?? '';
          const teacher = divs[4]?.getAttribute('title') ?? divs[4]?.textContent?.trim() ?? '';
          if (!subject) continue;
          periodRow[days[i]] = { subject, classCode, teacher };
        }

        periods.push(periodRow);
      }

      return { weekCommencing, periods } as {
        weekCommencing: string;
        periods: Array<{
          period: string;
          monday: { subject: string; classCode: string; teacher: string } | null;
          tuesday: { subject: string; classCode: string; teacher: string } | null;
          wednesday: { subject: string; classCode: string; teacher: string } | null;
          thursday: { subject: string; classCode: string; teacher: string } | null;
          friday: { subject: string; classCode: string; teacher: string } | null;
        }>;
      };
    });
  }
}
