import { Page } from 'playwright';
import { PLAYSTATION_CONFIG } from '../config.js';
import type { PlaytimeSettings } from '../types.js';

const { selectors, familyManagementUrl, playtimeOptions } = PLAYSTATION_CONFIG;

/**
 * Page Object Model for the PlayStation Account Management — Family Management page.
 * URL: https://account.sonyentertainmentnetwork.com/familyManagement
 *
 * This is a React SPA. All interactions wait for elements to be visible before acting.
 *
 * NOTE: Selectors in PLAYSTATION_CONFIG.selectors.familyManagement are best-effort
 * based on common Sony UI patterns. Run the Playwright MCP to verify / update them
 * if this page changes. See DOMAIN.md for instructions.
 */
export class FamilyManagementPage {
  constructor(private readonly page: Page) {}

  async navigate(): Promise<void> {
    await this.page.goto(familyManagementUrl, { waitUntil: 'networkidle' });
  }

  /**
   * Clicks the family member whose PSN Online ID starts with the given prefix.
   * Sony renders a list/grid of child accounts — each card shows the PSN Online ID.
   */
  async selectChildByPrefix(psnPrefix: string): Promise<string> {
    // Find the element containing the PSN prefix in the member list
    const memberSelector = selectors.familyManagement.memberLinkByPsnId(psnPrefix);
    const memberEl = this.page.locator(memberSelector).first();

    await memberEl.waitFor({ state: 'visible', timeout: 15_000 });

    // Extract the full PSN Online ID from the element text
    const fullText = (await memberEl.textContent()) ?? psnPrefix;
    // The PSN Online ID is typically the first word/segment of the text content
    const psnOnlineId = fullText.split(/\s+/)[0] ?? psnPrefix;

    await memberEl.click();
    await this.page.waitForLoadState('networkidle');

    return psnOnlineId;
  }

  /**
   * Reads the current playtime settings for the child currently shown on the page.
   * Call after selectChildByPrefix().
   */
  async readPlaytimeSettings(psnOnlineId: string, friendlyName: string): Promise<PlaytimeSettings> {
    const { restrictPlaytimeSelect, editPlaytimeButton, everydayDurationSelect } =
      selectors.familyManagement;

    // The playtime section may need the Edit button clicked to reveal the current values,
    // or they may be visible directly. Try the direct read first.
    const restrictEl = this.page.locator(restrictPlaytimeSelect).first();
    const durationEl = this.page.locator(everydayDurationSelect).first();

    let restrictValue = '';
    let durationLabel = '';

    try {
      await restrictEl.waitFor({ state: 'visible', timeout: 8_000 });
      restrictValue = await restrictEl.inputValue();
    } catch {
      // Playtime settings may be behind the Edit button
      await this.page.locator(editPlaytimeButton).first().click();
      await this.page.waitForLoadState('networkidle');
      restrictValue = await restrictEl.inputValue();
    }

    try {
      durationLabel = await durationEl.inputValue();
    } catch {
      durationLabel = '';
    }

    const restrictPlaytime =
      restrictValue.toLowerCase().includes('restrict') &&
      !restrictValue.toLowerCase().includes('not');

    const dailyMinutes = labelToMinutes(durationLabel);

    return { psnOnlineId, friendlyName, restrictPlaytime, dailyMinutes, dailyLimitLabel: durationLabel };
  }

  /**
   * Sets the playtime for the child currently shown on the page.
   * Ensures "Restrict Playtime" is set to "Restrict", then sets the
   * "Everyday" duration to the specified number of minutes, and saves.
   */
  async setPlaytime(dailyMinutes: number): Promise<string> {
    const { editPlaytimeButton, restrictPlaytimeSelect, restrictPlaytimeOption, everydayDurationSelect, saveButton } =
      selectors.familyManagement;

    const targetLabel = playtimeOptions[dailyMinutes];
    if (!targetLabel) {
      const valid = Object.keys(playtimeOptions).join(', ');
      throw new Error(`Invalid dailyMinutes: ${dailyMinutes}. Valid values: ${valid}`);
    }

    // Open the playtime edit form
    await this.page.locator(editPlaytimeButton).first().waitFor({ state: 'visible', timeout: 15_000 });
    await this.page.locator(editPlaytimeButton).first().click();
    await this.page.waitForLoadState('networkidle');

    // Ensure "Restrict Playtime" is set to "Restrict"
    const restrictEl = this.page.locator(restrictPlaytimeSelect).first();
    await restrictEl.waitFor({ state: 'visible', timeout: 10_000 });
    await restrictEl.selectOption({ label: restrictPlaytimeOption });

    // Set the "Everyday" duration
    const durationEl = this.page.locator(everydayDurationSelect).first();
    await durationEl.waitFor({ state: 'visible', timeout: 10_000 });
    await durationEl.selectOption({ label: targetLabel });

    // Save
    await this.page.locator(saveButton).first().waitFor({ state: 'visible', timeout: 5_000 });
    await this.page.locator(saveButton).first().click();
    await this.page.waitForLoadState('networkidle');

    return targetLabel;
  }
}

/**
 * Converts a PlayStation playtime label (e.g. "1 Hour 30 Minutes") to minutes.
 * Returns null if the label cannot be parsed.
 */
function labelToMinutes(label: string): number | null {
  if (!label) return null;

  // Check config reverse-lookup first (exact match)
  const entry = Object.entries(PLAYSTATION_CONFIG.playtimeOptions).find(
    ([, v]) => v.toLowerCase() === label.toLowerCase(),
  );
  if (entry) return Number(entry[0]);

  // Fallback: parse "X Hour(s) Y Minutes"
  let total = 0;
  const hourMatch = label.match(/(\d+)\s+hour/i);
  const minMatch = label.match(/(\d+)\s+min/i);
  if (hourMatch) total += parseInt(hourMatch[1], 10) * 60;
  if (minMatch) total += parseInt(minMatch[1], 10);
  return total > 0 ? total : null;
}
