import { expect, test } from '@playwright/test';
import { signIn, state } from './state.js';

test('a teacher with one class assigns a problem straight from the home page (OJ-33)', async ({ page }) => {
  await signIn(page, state().lan);
  await page.getByRole('main').getByRole('button', { name: /^Giao bài/ }).click();

  // One active class: no class question, straight to the bank picker for that class.
  const picker = page.getByRole('dialog', { name: 'Giao bài cho lớp' });
  await expect(picker).toBeVisible();
  await picker.getByRole('tab', { name: 'Một bài lẻ' }).click();
  await picker.getByRole('button', { name: /Hiệu hai số/ }).click();

  const create = page.getByRole('dialog', { name: 'Giao bài', exact: true });
  await expect(create.getByText('Tin học 10A1')).toBeVisible();
  await create.getByRole('button', { name: 'Giao bài', exact: true }).click();

  await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'Hiệu hai số' })).toBeVisible();
});
