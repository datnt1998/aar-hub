import { expect, test } from '@playwright/test';

test('home page shows the live API health from apps/api', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'aar-hub' })).toBeVisible();
  await expect(page.getByText('API hoạt động')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Kiểm tra lại' })).toBeEnabled();
});
