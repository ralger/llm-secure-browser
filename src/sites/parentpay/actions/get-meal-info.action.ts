import { ICredentialProvider } from '../../../core/credentials/index.js';
import { HomePage } from '../pages/home.page.js';
import { StatementsPage, ParentAccountInfo } from '../pages/statements.page.js';
import { MealsCalendarPage, WeekMeals } from '../pages/meals-calendar.page.js';
import { ensureLoggedIn, withAutoRelogin } from './login.action.js';

const WEEKS_TO_FETCH = 3;

export interface ChildMealInfo {
  name: string;
  consumerId: string;
  balance: {
    balanceGbp: number;
    balanceText: string;
  };
  meals: {
    weeksIncluded: number;
    weeks: WeekMeals[];
  };
}

export interface MealInfoResult {
  fetchedAt: string;
  parentAccount: ParentAccountInfo;
  children: ChildMealInfo[];
}

/**
 * Single comprehensive call: returns Parent Account balance, each child's
 * dinner money balance, and 3 weeks of taken meal history for all children.
 *
 * Loading strategy:
 *   1. Home page + Statements page loaded in parallel → balances (fast)
 *   2. Meal calendar pages loaded sequentially with human-like delays → meals (slow)
 *
 * Automatically recovers from an expired server-side session via withAutoRelogin.
 */
export function getMealInfo(
  credentialProvider: ICredentialProvider,
): Promise<MealInfoResult> {
  return withAutoRelogin(credentialProvider, () => _getMealInfo(credentialProvider));
}

async function _getMealInfo(
  credentialProvider: ICredentialProvider,
): Promise<MealInfoResult> {
  const { context, page: homePage_p, basePath } = await ensureLoggedIn(credentialProvider);

  // ── Phase 1: Load Home + Statements in parallel ───────────────────────────
  const statementsPage_p = await context.newPage();

  const [children, parentAccount] = await Promise.all([
    (async () => {
      const homePage = new HomePage(homePage_p, basePath);
      await homePage.navigate();
      return homePage.getChildren();
    })(),
    (async () => {
      const statementsPage = new StatementsPage(statementsPage_p, basePath);
      await statementsPage.navigate();
      return statementsPage.getParentAccountBalance();
    })(),
  ]);

  await Promise.all([
    homePage_p.close().catch(() => {}),
    statementsPage_p.close().catch(() => {}),
  ]);

  // ── Phase 2: Load meal calendars sequentially ─────────────────────────────
  const today = new Date();
  const childResults: ChildMealInfo[] = [];

  for (let ci = 0; ci < children.length; ci++) {
    const child = children[ci];
    const calPage = await context.newPage();
    const cal = new MealsCalendarPage(calPage, basePath);
    const weeks: WeekMeals[] = [];

    for (let w = WEEKS_TO_FETCH - 1; w >= 0; w--) {
      weeks.push(await cal.getMealsForWeek(child.consumerId, getMondayOffset(today, -w)));
      if (w > 0) await humanDelay(1200, 800);
    }

    await calPage.close().catch(() => {});
    childResults.push({
      name: child.name,
      consumerId: child.consumerId,
      balance: { balanceGbp: child.balanceGbp, balanceText: child.balanceText },
      meals: { weeksIncluded: WEEKS_TO_FETCH, weeks },
    });

    if (ci < children.length - 1) await humanDelay(2500, 1000);
  }

  return {
    fetchedAt: new Date().toISOString(),
    parentAccount,
    children: childResults,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getMondayOffset(today: Date, weekOffset: number): string {
  const d = new Date(today);
  const day = d.getDay();
  const daysToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + daysToMonday + weekOffset * 7);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

function humanDelay(baseMs: number, jitterMs: number): Promise<void> {
  return new Promise((resolve) =>
    setTimeout(resolve, baseMs + Math.floor(Math.random() * jitterMs)),
  );
}
