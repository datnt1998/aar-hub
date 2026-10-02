import { expect, test } from './fixtures';

test('home page shows the live API health from apps/api', async ({ page, expectAccessible }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Trạng thái API' })).toBeVisible();
  await expect(page.getByText('API hoạt động')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Kiểm tra lại' })).toBeEnabled();
  await expectAccessible();
});

test('unknown paths show the not-found screen with a way home', async ({ page, expectAccessible }) => {
  await page.goto('/khong-co-trang-nay');
  await expect(page.getByRole('heading', { name: 'Không tìm thấy trang' })).toBeVisible();
  await expectAccessible();
  await page.getByRole('link', { name: 'Về trang chủ' }).click();
  await expect(page.getByRole('heading', { name: 'Trạng thái API' })).toBeVisible();
});
