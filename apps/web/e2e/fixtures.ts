import AxeBuilder from '@axe-core/playwright';
import { test as base, expect } from '@playwright/test';

/**
 * `test` with `expectAccessible()`: an axe scan (WCAG 2.1 A/AA) of the current page that fails on any violation.
 * Call it once per screen, in the screen's main e2e test, after the screen has loaded.
 */
export const test = base.extend<{ expectAccessible: () => Promise<void> }>({
  expectAccessible: async ({ page }, use) => {
    await use(async () => {
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(results.violations).toEqual([]);
    });
  },
});

export { expect };
