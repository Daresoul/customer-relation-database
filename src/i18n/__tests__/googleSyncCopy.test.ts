import { describe, expect, it } from 'vitest';
import en from '../locales/en/settings.json';
import mk from '../locales/mk/settings.json';

// The sync sends appointments to Google and only reads cancellations back.
// The settings text must not promise more.
describe('Google Calendar settings text', () => {
  it('does not promise two-way sync or managing appointments from Google', () => {
    const texts = [en.googleCalendar.syncHint, en.googleCalendar.syncDescription];
    for (const text of texts) {
      expect(text).not.toMatch(/two-way|both systems/i);
    }
    const mkTexts = [mk.googleCalendar.syncHint, mk.googleCalendar.syncDescription];
    for (const text of mkTexts) {
      expect(text).not.toMatch(/двонасочн|двата системи/i);
    }
  });

  it('says that a cancellation in Google cancels the appointment here', () => {
    expect(en.googleCalendar.syncDescription).toMatch(/cancel/i);
    expect(mk.googleCalendar.syncDescription).toMatch(/откаж/i);
  });
});
