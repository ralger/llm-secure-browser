import { Page } from 'playwright';
import { CHURCHSUITE_CONFIG } from '../config.js';

export interface RotaPerson {
  name: string;
  role: string;
}

export interface RotaDate {
  dateId: string;
  date: string;
  time: string;
  notes: string;
  team: RotaPerson[];
}

export interface ChurchSuiteRota {
  id: string;
  name: string;
  dates: RotaDate[];
}

/**
 * Fetches rota data from the ChurchSuite member portal.
 *
 * Endpoints used (all require session cookie):
 *   GET /my/rotas                                     → list of rota IDs
 *   GET /my/rotas/{id}                                → rota name (page title)
 *   GET /my/ajax/rota_view?rota_id={id}&show=all&period=future
 *       → HTML grid of date cards, each pre-populated by server with team members
 *
 * HTML structure of each date card (.rota-date):
 *   h3.antialiased          → "22-Mar-2026"
 *   span.text-gray-600      → "8:45am"
 *   div.italic              → service notes
 *   li[class*="items-baseline"]  → one per person
 *     span[class*="space-x-1"] > span  → name
 *     div.text-xs > span               → role(s)
 */
export class ChurchSuiteRotasPage {
  constructor(private readonly page: Page) {}

  async getRotas(): Promise<ChurchSuiteRota[]> {
    const baseUrl = CHURCHSUITE_CONFIG.baseUrl;

    return this.page.evaluate(async (base) => {
      // ── 1. Discover rota IDs ───────────────────────────────────────────────
      const listHtml = await fetch(`${base}/my/rotas`).then((r) => r.text());
      const listDoc = new DOMParser().parseFromString(listHtml, 'text/html');
      const rotaIds = [
        ...new Set(
          Array.from(listDoc.querySelectorAll<HTMLAnchorElement>('a[href^="/my/rotas/"]'))
            .map((a) => a.getAttribute('href')?.split('/').pop() ?? '')
            .filter(Boolean),
        ),
      ];

      const rotas: Array<{
        id: string;
        name: string;
        dates: Array<{
          dateId: string;
          date: string;
          time: string;
          notes: string;
          team: Array<{ name: string; role: string }>;
        }>;
      }> = [];

      for (const rotaId of rotaIds) {
        // ── 2. Get rota name from detail page title ────────────────────────
        const detailHtml = await fetch(`${base}/my/rotas/${rotaId}`).then((r) => r.text());
        const detailDoc = new DOMParser().parseFromString(detailHtml, 'text/html');
        const pageTitle = detailDoc.title; // "My Rotas - Audio & Visuals"
        const name = pageTitle.replace(/^My\s+Rotas\s*[-–]\s*/i, '').trim() || `Rota ${rotaId}`;

        // ── 3. Get scheduled dates + team for each date ────────────────────
        const viewHtml = await fetch(
          `${base}/my/ajax/rota_view?rota_id=${rotaId}&show=all&period=future`,
        ).then((r) => r.text());
        const viewDoc = new DOMParser().parseFromString(viewHtml, 'text/html');

        const dates: typeof rotas[0]['dates'] = [];

        const rotaDateCards = viewDoc.querySelectorAll<HTMLElement>('.rota-date');

        rotaDateCards.forEach((card) => {
          // Date_id from the sibling form inside the wrapping x-data container
          const wrapper = card.closest<HTMLElement>('[x-data]');
          const dateId = wrapper?.querySelector<HTMLInputElement>('input[name="date_id"]')?.value ?? '';

          // Full date string (e.g. "22-Mar-2026") from h3 inside the dropdown
          const date = card.querySelector<HTMLElement>('h3.antialiased')?.textContent?.trim() ?? '';

          // Time (e.g. "8:45am") from the first visible span.text-gray-600
          const time = card.querySelector<HTMLElement>('span.text-gray-600')?.textContent?.trim() ?? '';

          // Service notes
          const notes = (card.querySelector<HTMLElement>('div.italic')?.textContent ?? '')
            .replace(/\s+/g, ' ')
            .trim();

          // Team members
          const team: Array<{ name: string; role: string }> = [];
          card.querySelectorAll<HTMLElement>('li[class*="items-baseline"]').forEach((li) => {
            const personName =
              li.querySelector<HTMLElement>('span[class*="space-x-1"] > span')?.textContent?.trim() ?? '';
            const roleEl = li.querySelector<HTMLElement>('div.text-xs');
            const personRole = roleEl
              ? Array.from(roleEl.querySelectorAll<HTMLElement>('span'))
                  .map((s) => s.textContent?.trim())
                  .filter(Boolean)
                  .join(', ')
              : '';

            if (personName) {
              team.push({ name: personName, role: personRole });
            }
          });

          if (date || team.length > 0) {
            dates.push({ dateId, date, time, notes, team });
          }
        });

        rotas.push({ id: rotaId, name, dates });
      }

      return rotas;
    }, baseUrl);
  }
}
