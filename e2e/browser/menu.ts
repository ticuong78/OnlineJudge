import type { Locator, Page } from '@playwright/test';

/**
 * Opens the account menu next to the name and returns its panel (OJ-32). Tổ chức and Bài nộp live there for staff;
 * students have no account menu, only a sign-out button.
 */
export async function openAccountMenu(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: /^(Tài khoản|Account):/ }).click();
  return page.locator('#account-menu');
}
