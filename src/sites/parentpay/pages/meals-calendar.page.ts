import { Page } from 'playwright';
import { PARENTPAY_CONFIG } from '../config.js';

const { appBaseUrl, paths } = PARENTPAY_CONFIG;

export interface MealEntry {
  date: string; // ISO format "YYYY-MM-DD"
  dayLabel: string; // e.g. "Mon 23 Feb"
  session: 'morning' | 'lunch' | 'unknown';
  item: string;
  taken: boolean;
}

export interface WeekMeals {
  weekCommencing: string; // ISO format "YYYY-MM-DD" (Monday)
  entries: MealEntry[];
  /** true if the header for the day shows Taken, false = Not taken (for the lunch session) */
  dayTakenStatus: Record<string, boolean>; // day label → taken
}

/**
 * Page Object Model for the ParentPay "Taken meals and menus" calendar.
 * URL: /V3Payer4W3/Payer/MenusAndChoices.aspx?ConsumerId={id}&Date={YYYY-MM-DD}
 *
 * The page renders a single week (Mon-Fri) as a table.
 * Rows alternate between section headers (Morning / Lunch time) and item rows.
 *
 * Table structure (discovered via MCP exploration):
 *   thead tr:  TH[0..4] → day+date label, img alt="Taken"/"Not taken"
 *   tbody rows:
 *     - section-label row: cell with <strong> "Morning" or "Lunch time" (no img)
 *     - item row: cells with <strong>item name</strong> + img[alt="Taken"], others empty
 *     - separator row: single TD[colspan=5], empty
 */
export class MealsCalendarPage {
  constructor(
    private readonly page: Page,
    private readonly basePath: string,
  ) {}

  async navigate(consumerId: string, mondayDate: string): Promise<void> {
    const url = `${appBaseUrl}${paths.mealsCalendar(this.basePath, consumerId, mondayDate)}`;
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
  }

  async getMealsForWeek(consumerId: string, mondayDate: string): Promise<WeekMeals> {
    await this.navigate(consumerId, mondayDate);

    // Wait for the table — if the page shows "No results" we still get an empty table
    await this.page.waitForSelector('table', { timeout: 10_000 });

    const raw = await this.page.evaluate(() => {
      const table = document.querySelector('table');
      if (!table) return null;

      const allRows = Array.from(table.querySelectorAll('tr'));
      const headerRow = allRows[0];
      const bodyRows = allRows.slice(1);

      // Parse column headers: [{dayLabel, taken}]
      const headers = Array.from(headerRow?.querySelectorAll('th') ?? []).map((th) => ({
        dayLabel: th.childNodes[0]?.textContent?.trim() ?? '',
        taken: th.querySelector('img')?.getAttribute('alt') === 'Taken',
      }));

      // Parse body rows
      const SECTION_NAMES = new Set(['Morning', 'Lunch time']);
      // Per-column current section tracking
      const currentSection: string[] = new Array(5).fill('unknown');

      const entries: Array<{
        dayLabel: string;
        session: string;
        item: string;
        taken: boolean;
      }> = [];

      bodyRows.forEach((row) => {
        const cells = Array.from(row.querySelectorAll('td'));
        // Skip separator rows (single colspan=5 empty cell)
        if (cells.length === 1 && cells[0].getAttribute('colspan')) return;

        cells.forEach((cell, colIdx) => {
          const strong = cell.querySelector('strong');
          const img = cell.querySelector('img');

          if (!strong) return;

          const strongText = strong.textContent?.trim() ?? '';

          if (SECTION_NAMES.has(strongText) && !img) {
            // Section label — update this column's section
            currentSection[colIdx] = strongText === 'Morning' ? 'morning' : 'lunch';
            return;
          }

          if (img && img.getAttribute('alt') === 'Taken' && strongText) {
            // Item row
            entries.push({
              dayLabel: headers[colIdx]?.dayLabel ?? '',
              session: currentSection[colIdx] ?? 'unknown',
              item: strongText,
              taken: true,
            });
          }
        });
      });

      return { headers, entries };
    });

    if (!raw) {
      return { weekCommencing: mondayDate, entries: [], dayTakenStatus: {} };
    }

    const dayTakenStatus: Record<string, boolean> = {};
    raw.headers.forEach((h) => {
      if (h.dayLabel) dayTakenStatus[h.dayLabel] = h.taken;
    });

    const entries: MealEntry[] = raw.entries.map((e) => ({
      date: this.parseDayLabelToISO(e.dayLabel, mondayDate),
      dayLabel: e.dayLabel,
      session: e.session as 'morning' | 'lunch' | 'unknown',
      item: e.item,
      taken: e.taken,
    }));

    return { weekCommencing: mondayDate, entries, dayTakenStatus };
  }

  /**
   * Retrieve taken meals for the last N weeks (not including current week).
   * Returns entries flattened and sorted by date.
   */
  async getMealsForLastNWeeks(consumerId: string, weeks = 4): Promise<MealEntry[]> {
    const today = new Date();
    const allEntries: MealEntry[] = [];

    for (let w = 1; w <= weeks; w++) {
      const monday = this.getMondayOfWeek(today, -w);
      const mondayStr = monday.toISOString().split('T')[0];
      const weekData = await this.getMealsForWeek(consumerId, mondayStr);
      allEntries.push(...weekData.entries);
    }

    // Sort by date ascending
    return allEntries.sort((a, b) => a.date.localeCompare(b.date));
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private getMondayOfWeek(referenceDate: Date, weekOffset = 0): Date {
    const d = new Date(referenceDate);
    const day = d.getDay(); // 0=Sun, 1=Mon...
    const daysToMonday = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + daysToMonday + weekOffset * 7);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /**
   * Convert "Mon 23 Feb" to ISO date string using the week context.
   * Parses the day number and month from the label against the reference year.
   */
  private parseDayLabelToISO(dayLabel: string, mondayIso: string): string {
    // e.g. "Mon 23 Feb" — parse day number and month
    const match = dayLabel.match(/(\d{1,2})\s+([A-Za-z]+)/);
    if (!match) return mondayIso;

    const day = parseInt(match[1], 10);
    const monthStr = match[2];
    const refYear = parseInt(mondayIso.split('-')[0], 10);
    const refMonth = parseInt(mondayIso.split('-')[1], 10) - 1; // 0-indexed

    const MONTHS: Record<string, number> = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
    };

    let month = MONTHS[monthStr];
    if (month === undefined) return mondayIso;

    // Handle year boundary (e.g. Monday in Dec, items might span into Jan)
    let year = refYear;
    if (refMonth === 11 && month === 0) year += 1;
    if (refMonth === 0 && month === 11) year -= 1;

    const d = new Date(year, month, day);
    return d.toISOString().split('T')[0];
  }
}
