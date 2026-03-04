import { Page } from 'playwright';
import { MCAS_CONFIG } from '../config.js';
import { DailyAttendance } from '../types.js';

const { attendanceUrl, attendanceColors, attendanceColorDefault } = MCAS_CONFIG;

/**
 * Page Object Model for the MCAS attendance calendar page.
 * URL: /MCAS/MCSAttendanceReports.aspx
 *
 * The page renders a full academic-year calendar.  Each day cell has an
 * inline `background-color` style that encodes attendance status.
 *
 * NOTE: Switch child context before calling navigate() so the page renders
 * the correct student's data.
 */
export class AttendancePage {
  constructor(private readonly page: Page) {}

  async navigate(): Promise<void> {
    await this.page.goto(attendanceUrl, { waitUntil: 'networkidle' });
  }

  /**
   * Returns attendance status for each of the provided ISO dates (YYYY-MM-DD).
   * Dates not present in the calendar (future or outside academic year) are
   * returned with status "NotRequired".
   */
  async getDailyAttendance(isoDates: string[]): Promise<DailyAttendance[]> {
    const colorMap = attendanceColors;
    const defaultStatus = attendanceColorDefault;

    const found = await this.page.evaluate(
      ({ isoDates, colorMap, defaultStatus }) => {
        const results: Array<{ date: string; status: string }> = [];
        const monthNames = [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December',
        ];

        // Build a Set of target ISO dates for fast lookup
        const targets = new Set(isoDates);

        // Academic year: Sep–Dec = startYear (2025), Jan–Aug = startYear+1 (2026)
        // Determine startYear from the target dates themselves
        const years = isoDates.map(d => parseInt(d.substring(0, 4), 10));
        const maxYear = Math.max(...years);
        // If any target date is Jan-Aug, maxYear is the end-year (e.g. 2026)
        // Start year = maxYear - 1 if all target months are Jan-Aug, else maxYear
        // Safest: if any target is Sep-Dec, startYear = that year; else startYear = maxYear-1
        const startYear = isoDates.some(d => parseInt(d.substring(5, 7)) >= 9)
          ? maxYear
          : maxYear - 1;

        // Find all calendar tables (each has a <caption> with month name)
        const tables = Array.from(document.querySelectorAll('table'));
        for (const table of tables) {
          const caption = table.querySelector('caption');
          if (!caption) continue;
          const monthText = caption.textContent?.trim() ?? '';
          const monthIndex = monthNames.indexOf(monthText); // 0-based
          if (monthIndex === -1) continue;

          // Determine year: Sep(8)-Dec(11) = startYear, Jan(0)-Aug(7) = startYear+1
          const year = monthIndex >= 8 ? startYear : startYear + 1;
          const mm = String(monthIndex + 1).padStart(2, '0');

          // Find all colored day cells in this table
          const cells = Array.from(table.querySelectorAll('td[style]'));
          for (const cell of cells) {
            const style = cell.getAttribute('style') ?? '';
            if (!style.includes('background-color')) continue;

            // Day number is in the <span> child
            const span = cell.querySelector('span');
            const dayText = span?.textContent?.trim() ?? cell.textContent?.trim() ?? '';
            const day = parseInt(dayText, 10);
            if (isNaN(day) || day < 1 || day > 31) continue;

            const dd = String(day).padStart(2, '0');
            const isoDate = `${year}-${mm}-${dd}`;

            if (!targets.has(isoDate)) continue;

            // Extract background color from style attribute (handles hex directly)
            const colorMatch = style.match(/background-color:\s*(#[0-9a-fA-F]{6})/i);
            let hexColor = colorMatch?.[1]?.toLowerCase() ?? '';

            // Fallback: check computed style (may be rgb())
            if (!hexColor) {
              const computed = (cell as HTMLElement).style.backgroundColor;
              if (computed.startsWith('rgb')) {
                const nums = computed.match(/\d+/g);
                if (nums && nums.length >= 3) {
                  hexColor = '#' + [nums[0], nums[1], nums[2]]
                    .map(n => parseInt(n, 10).toString(16).padStart(2, '0'))
                    .join('');
                }
              }
            }

            const status = (colorMap as Record<string, string>)[hexColor] ?? defaultStatus;
            results.push({ date: isoDate, status });
          }
        }

        return results;
      },
      { isoDates, colorMap, defaultStatus },
    );

    // For any requested dates not found in the calendar, return NotRequired
    const foundDates = new Set(found.map((r) => r.date));
    const all: DailyAttendance[] = [];
    for (const iso of isoDates) {
      if (foundDates.has(iso)) {
        all.push(found.find((r) => r.date === iso)!);
      } else {
        all.push({ date: iso, status: 'NotRequired' });
      }
    }

    return all;
  }
}
