import { expect, test } from '@playwright/test';
import { signIn, state } from './state.js';

test('a student reads the problem, writes code in the editor and submits it', async ({ page }) => {
  const s = state();
  await signIn(page, s.student);
  await page.goto(`/sessions/${s.sessionId}/problems/${s.problemKey}`);
  await expect(page.getByRole('heading', { name: 'Tổng hai số' })).toBeVisible();
  await expect(page.getByText('1000000000')).toHaveCount(0); // the hidden test never reaches the page

  await page.getByRole('combobox', { name: 'Ngôn ngữ' }).selectOption('python');
  const editor = page.locator('.monaco-editor').first();
  await editor.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.type('a, b = map(int, input().split())\nprint(a + b)');
  await page.getByRole('button', { name: 'Nộp bài' }).click();
  await expect(page.getByText('Đã nộp bài.', { exact: false })).toBeVisible();

  await page.getByRole('tab', { name: 'Bài nộp của tôi' }).click();
  await expect(page.getByText('Bạn chưa nộp bài này trong phiên')).toHaveCount(0);
  await expect(page.getByRole('table').getByRole('row').filter({ hasText: 'Python 3' })).toHaveCount(1);
});

test('on a phone, one tap jumps from the statement to the code and back (OJ-33)', async ({ page }) => {
  const s = state();
  await page.setViewportSize({ width: 375, height: 600 });
  await signIn(page, s.student);
  await page.goto(`/sessions/${s.sessionId}/problems/${s.problemKey}`);
  const heading = page.getByRole('heading', { name: 'Tổng hai số' });
  await expect(heading).toBeInViewport();

  await page.getByRole('button', { name: 'Viết code', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Nộp bài', exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Đề bài', exact: true })).toBeVisible();
  // Focus follows the jump: the floating button that was pressed is gone now.
  await expect(page.getByRole('combobox', { name: 'Ngôn ngữ' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Viết code', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Đề bài', exact: true }).click();
  await expect(heading).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Viết code', exact: true })).toBeVisible();
});
