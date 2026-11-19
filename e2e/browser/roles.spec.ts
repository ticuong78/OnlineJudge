import { expect, test } from '@playwright/test';
import { openAccountMenu } from './menu.js';
import { signIn, state } from './state.js';

test.describe('signing in shows each role its own home and menu', () => {
  test('wrong password: an error, no session', async ({ page }) => {
    const s = state();
    await page.goto('/login');
    await page.getByLabel('Email').fill(s.student.email);
    await page.getByLabel('Mật khẩu', { exact: true }).fill('sai-mat-khau');
    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    await expect(page.getByText('Email hoặc mật khẩu không đúng.')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('administrator', async ({ page }) => {
    await signIn(page, state().admin);
    const nav = page.locator('header nav');
    await expect(nav.getByRole('link', { name: 'Người dùng' })).toBeVisible();
    await expect((await openAccountMenu(page)).getByRole('link', { name: 'Tổ chức' })).toBeVisible();
  });

  test('teacher (org admin)', async ({ page }) => {
    await signIn(page, state().lan);
    const nav = page.locator('header nav');
    await expect(nav.getByRole('link', { name: 'Ngân hàng' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Người dùng' })).toHaveCount(0);
    // OJ-32: four items in the bar; organizations and submissions sit in the account menu.
    await expect(nav.getByRole('link', { name: 'Nhập đề' })).toHaveCount(0);
    const menu = await openAccountMenu(page);
    await expect(menu.getByRole('link', { name: 'Tổ chức' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Bài nộp' })).toBeVisible();
  });

  test('student', async ({ page }) => {
    await signIn(page, state().student);
    const nav = page.locator('header nav');
    await expect(nav.getByRole('link', { name: 'Học bạ' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Ngân hàng' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Đăng xuất' })).toBeVisible(); // students keep a one-click sign out
    await page.goto('/admin/users');
    await expect(page.getByText('Bạn không có quyền truy cập trang này')).toBeVisible();
  });
});
