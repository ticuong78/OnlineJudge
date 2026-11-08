import { expect, test } from '@playwright/test';
import { signIn, state } from './state.js';

test.describe('signing in shows each role its own home and menu', () => {
  test('wrong password: an error, no session', async ({ page }) => {
    const s = state();
    await page.goto('/login');
    await page.getByLabel('Email').fill(s.student.email);
    await page.getByLabel('Mật khẩu').fill('sai-mat-khau');
    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    await expect(page.getByText('Email hoặc mật khẩu không đúng.')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('administrator', async ({ page }) => {
    await signIn(page, state().admin);
    const nav = page.locator('header nav');
    await expect(nav.getByRole('link', { name: 'Người dùng' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Tổ chức' })).toBeVisible();
  });

  test('teacher (org admin)', async ({ page }) => {
    await signIn(page, state().lan);
    const nav = page.locator('header nav');
    await expect(nav.getByRole('link', { name: 'Ngân hàng' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Tổ chức' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Người dùng' })).toHaveCount(0);
  });

  test('student', async ({ page }) => {
    await signIn(page, state().student);
    const nav = page.locator('header nav');
    await expect(nav.getByRole('link', { name: 'Học bạ' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Ngân hàng' })).toHaveCount(0);
    await page.goto('/admin/users');
    await expect(page.getByText('Bạn không có quyền truy cập trang này')).toBeVisible();
  });
});
