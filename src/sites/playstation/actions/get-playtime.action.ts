import { ICredentialProvider } from '../../../core/credentials/index.js';
import { FamilyManagementPage } from '../pages/family-management.page.js';
import { PLAYSTATION_CONFIG } from '../config.js';
import { withFreshSession } from './session.action.js';
import type { GetPlaytimeResult } from '../types.js';

/**
 * Fetches the current playtime settings for both children.
 *
 * Opens a fresh browser session, logs in with TOTP, navigates to family
 * management, and reads the current playtime restriction + daily limit for
 * each child in order.
 */
export async function getPlaytime(
  credentialProvider: ICredentialProvider,
): Promise<GetPlaytimeResult> {
  return withFreshSession(credentialProvider, async (page) => {
    const familyPage = new FamilyManagementPage(page);
    await familyPage.navigate();

    const children = [];

    for (const child of PLAYSTATION_CONFIG.children) {
      const psnOnlineId = await familyPage.selectChildByPrefix(child.psnPrefix);
      const settings = await familyPage.readPlaytimeSettings(psnOnlineId, child.friendlyName);
      children.push(settings);

      // Return to the family member list for the next child
      await familyPage.navigate();
    }

    return {
      fetchedAt: new Date().toISOString(),
      children,
    };
  });
}
