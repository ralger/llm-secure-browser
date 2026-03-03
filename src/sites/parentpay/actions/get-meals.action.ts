import { ICredentialProvider } from '../../../core/credentials/index.js';
import { MealsCalendarPage, MealEntry } from '../pages/meals-calendar.page.js';
import { ensureLoggedIn } from './login.action.js';

export interface GetMealsOptions {
  consumerId: string;
  /** Number of past weeks to retrieve (default: 4) */
  weeks?: number;
}

/**
 * Retrieves taken meal entries for a child over the last N weeks.
 * Each entry contains: date, session (morning/lunch), item name, and taken status.
 */
export async function getMeals(
  credentialProvider: ICredentialProvider,
  options: GetMealsOptions,
): Promise<MealEntry[]> {
  const { page, basePath } = await ensureLoggedIn(credentialProvider);
  try {
    const calendarPage = new MealsCalendarPage(page, basePath);
    return await calendarPage.getMealsForLastNWeeks(options.consumerId, options.weeks ?? 4);
  } finally {
    await page.close();
  }
}
