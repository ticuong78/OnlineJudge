import { expect, test } from '@playwright/test';
import { state } from './state.js';

// OJ-12: the interface language is a cookie read by the server, so it holds across reloads and sign-in.
test('a student switches to English on the sign-in page and back to Vietnamese from the header', async ({ page }) => {
  const s = state();
  await page.goto('/login');
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');

  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');

  await page.locator('input[type="email"]').fill(s.student.email);
  await page.locator('input[type="password"]').fill(s.student.password);
  await page.locator('button[type="submit"]').click();

  const nav = page.locator('header nav');
  await expect(nav.getByRole('link', { name: 'Progress' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Practice' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(nav.getByRole('link', { name: 'Progress' })).toBeVisible();

  await page.getByRole('button', { name: 'Tiếng Việt' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  await expect(nav.getByRole('link', { name: 'Học bạ' })).toBeVisible();
});
