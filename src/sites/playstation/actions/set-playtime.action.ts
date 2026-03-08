import { ICredentialProvider } from '../../../core/credentials/index.js';
import { FamilyManagementPage } from '../pages/family-management.page.js';
import { PLAYSTATION_CONFIG, getChildBySlug } from '../config.js';
import { withFreshSession } from './session.action.js';
import type { SetPlaytimeInput, SetPlaytimeResult } from '../types.js';

/**
 * Sets the daily playtime limit for a single child.
 *
 * - Always ensures "Restrict Playtime" is set to "Restrict"
 * - Sets the "Everyday" duration to the specified number of minutes
 * - dailyMinutes must be a key in PLAYSTATION_CONFIG.playtimeOptions
 */
export async function setPlaytime(
  credentialProvider: ICredentialProvider,
  input: SetPlaytimeInput,
): Promise<SetPlaytimeResult> {
  const child = getChildBySlug(input.slug);

  return withFreshSession(credentialProvider, async (page) => {
    const familyPage = new FamilyManagementPage(page);
    await familyPage.navigate();

    const psnOnlineId = await familyPage.selectChildByPrefix(child.psnPrefix);
    const appliedLabel = await familyPage.setPlaytime(input.dailyMinutes);

    return {
      psnOnlineId,
      friendlyName: child.friendlyName,
      dailyMinutes: input.dailyMinutes,
      dailyLimitLabel: appliedLabel,
    };
  });
}
