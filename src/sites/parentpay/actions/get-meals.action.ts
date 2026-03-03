import { ICredentialProvider } from '../../../core/credentials/index.js';
import { MealsCalendarPage, WeekMeals } from '../pages/meals-calendar.page.js';
import { HomePage } from '../pages/home.page.js';
import { ensureLoggedIn } from './login.action.js';

/** How many weeks to always fetch (current week + this many prior). */
const WEEKS_TO_FETCH = 3;

export interface ChildMeals {
  name: string;
  consumerId: string;
  weeks: WeekMeals[];
}

export interface AllMealsResult {
  fetchedAt: string;
  weeksIncluded: number;
  children: ChildMeals[];
}

/**
 * Fetches taken meal data for all children across the last 3 weeks
 * (including the current week).
 *
 * Pages are loaded strictly sequentially with randomised delays between
 * navigations to mimic natural human browsing behaviour.
 */
export async function getAllMeals(
  credentialProvider: ICredentialProvider,
): Promise<AllMealsResult> {
  const { context, page, basePath } = await ensureLoggedIn(credentialProvider);

  // Discover children dynamically from the Home page
  const homePage = new HomePage(page, basePath);
  await homePage.navigate();
  const children = await homePage.getChildren();
  await page.close();

  const today = new Date();
  const childResults: ChildMeals[] = [];

  for (let ci = 0; ci < children.length; ci++) {
    const child = children[ci];
    const childPage = await context.newPage();
    const cal = new MealsCalendarPage(childPage, basePath);
    const weeks: WeekMeals[] = [];

    // Fetch from oldest → newest (current week last)
    for (let w = WEEKS_TO_FETCH - 1; w >= 0; w--) {
      const monday = getMondayOffset(today, -w);
      weeks.push(await cal.getMealsForWeek(child.consumerId, monday));
      if (w > 0) await humanDelay(1200, 800); // pause between week navigations
    }

    await childPage.close();
    childResults.push({ name: child.name, consumerId: child.consumerId, weeks });

    // Pause between children — more noticeable break like a human changing tab
    if (ci < children.length - 1) await humanDelay(2500, 1000);
  }

  return {
    fetchedAt: new Date().toISOString(),
    weeksIncluded: WEEKS_TO_FETCH,
    children: childResults,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the ISO date string (YYYY-MM-DD) of the Monday at weekOffset from today's week. */
function getMondayOffset(today: Date, weekOffset: number): string {
  const d = new Date(today);
  const day = d.getDay(); // 0=Sun
  const daysToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + daysToMonday + weekOffset * 7);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

/** Wait baseMs + random jitter up to jitterMs. */
function humanDelay(baseMs: number, jitterMs: number): Promise<void> {
  return new Promise((resolve) =>
    setTimeout(resolve, baseMs + Math.floor(Math.random() * jitterMs)),
  );
}
