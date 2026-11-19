import { expect, test } from '@playwright/test';
import { signIn, state } from './state.js';

test("a teacher's session page shows the class's progress and one rejudge menu (OJ-34)", async ({ page }) => {
  const s = state();
  await signIn(page, s.lan);
  await page.goto(`/sessions/${s.sessionId}`);
  // The class's count per problem (the student's submission may still be judging), never the teacher's "Chưa làm".
  await expect(page.getByText(/^\d+\/1 giải trọn$/)).toBeVisible();
  await expect(page.getByText('Chưa làm', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: /^Chấm lại/ }).click();
  const menu = page.locator('#rejudge-menu');
  await expect(menu.getByRole('button', { name: 'Chấm lại tất cả' })).toBeVisible();
  await expect(menu.getByRole('button', { name: /Cập nhật nội dung bài từ ngân hàng/ })).toBeVisible();
  await menu.getByRole('button', { name: 'Chấm lại tất cả' }).click();
  // Still asks first; cancelling changes nothing.
  const confirm = page.getByRole('dialog', { name: 'Chấm lại mọi bài nộp?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Hủy' }).click();
  await expect(confirm).toHaveCount(0);
});
