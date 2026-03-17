import { Page } from 'playwright';
import { CHURCHSUITE_CONFIG } from '../config.js';

export interface ChurchSuiteEvent {
  id: string;
  name: string;
  date: string;
  time: string;
  location: string;
  url: string;
}

/**
 * Fetches the next 6 weeks of member-visible events from the ChurchSuite
 * member portal AJAX endpoint.
 *
 * HTML structure (parsed with DOMParser in browser context):
 *   a[href^="/my/events/"]  →  parent card  →  h3 > span (name)
 *   li > span[tabindex="-1"]  (0=date, 1=time, 2=location)
 */
export class ChurchSuiteEventsPage {
  constructor(private readonly page: Page) {}

  async getEvents(): Promise<ChurchSuiteEvent[]> {
    const ajaxUrl = CHURCHSUITE_CONFIG.ajax.events;

    return this.page.evaluate(async (url) => {
      const resp = await fetch(url);
      const html = await resp.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');

      const events: Array<{
        id: string;
        name: string;
        date: string;
        time: string;
        location: string;
        url: string;
      }> = [];

      const eventLinks = doc.querySelectorAll<HTMLAnchorElement>('a[href^="/my/events/"]');

      eventLinks.forEach((link) => {
        const card = link.closest<HTMLElement>('.bg-white');
        if (!card) return;

        const href = link.getAttribute('href') ?? '';
        const id = href.split('/').pop() ?? '';
        const name = card.querySelector('h3 > span')?.textContent?.trim() ?? '';
        const cells = card.querySelectorAll<HTMLElement>('span[tabindex="-1"]');
        const date = cells[0]?.textContent?.trim() ?? '';
        const time = cells[1]?.textContent?.trim() ?? '';
        const location = cells[2]?.textContent?.trim() ?? '';

        if (name && id) {
          events.push({ id, name, date, time, location, url: href });
        }
      });

      return events;
    }, ajaxUrl);
  }
}
