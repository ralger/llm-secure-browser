/** Current playtime settings for a single child account */
export interface PlaytimeSettings {
  /** PSN Online ID (full, as shown on PS5 / in account management) */
  psnOnlineId: string;
  /** Friendly name — Sam or Manu */
  friendlyName: string;
  /** Whether "Restrict Playtime" is set to "Restrict" (vs "Do Not Restrict") */
  restrictPlaytime: boolean;
  /**
   * Current "Everyday" duration in minutes.
   * null if not set or could not be parsed.
   */
  dailyMinutes: number | null;
  /** Raw label text from the dropdown as shown in PlayStation UI */
  dailyLimitLabel: string;
}

/** Result shape returned by the get-playtime action */
export interface GetPlaytimeResult {
  fetchedAt: string;
  children: PlaytimeSettings[];
}

/** Input for the set-playtime action */
export interface SetPlaytimeInput {
  /** URL slug — 'solar' | 'reactive' */
  slug: string;
  /** Duration in minutes. Must be a value from PLAYSTATION_CONFIG.playtimeOptions */
  dailyMinutes: number;
}

/** Result shape returned by the set-playtime action */
export interface SetPlaytimeResult {
  psnOnlineId: string;
  friendlyName: string;
  dailyMinutes: number;
  dailyLimitLabel: string;
}
