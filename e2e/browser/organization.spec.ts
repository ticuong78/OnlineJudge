import { expect, test } from '@playwright/test';
import { signIn, state } from './state.js';

test.describe.serial('organization plan in the browser', () => {
  test('the org admin invites an existing teacher from the organization page', async ({ page }) => {
    const s = state();
    await signIn(page, s.lan);
    await page.goto(`/organizations/${s.organizationId}`);
    await expect(page.getByRole('heading', { name: 'Trung tâm Tin học Sao Mai' })).toBeVisible();
    await page.getByRole('button', { name: 'Mời giáo viên' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Email', { exact: true }).fill(s.minh.email);
    await dialog.getByLabel(/Họ và tên/).fill('Trần Văn Minh');
    await dialog.getByRole('button', { name: 'Gửi lời mời' }).click();
    await expect(page.getByText('đã có tài khoản, chờ chấp nhận')).toBeVisible();
  });

  test('the invited teacher joins from the home page and gets the organization menu', async ({ page }) => {
    const s = state();
    await signIn(page, s.minh);
    const nav = page.locator('header nav');
    await expect(nav.getByRole('link', { name: 'Tổ chức' })).toHaveCount(0);
    await expect(page.getByText('Lời mời vào tổ chức')).toBeVisible();
    await page.getByRole('button', { name: 'Tham gia' }).click();
    await expect(page.getByText('Lời mời vào tổ chức')).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Tổ chức' })).toBeVisible();
    await nav.getByRole('link', { name: 'Tổ chức' }).click();
    await expect(page.getByText('Trung tâm Tin học Sao Mai')).toBeVisible();
  });

  test('a new teacher opens the emailed invitation, the code is filled in, and the account joins the organization', async ({ page }) => {
    const s = state();
    await page.goto(s.newTeacher.inviteUrl);
    await expect(page.getByText('Kích hoạt tài khoản giáo viên')).toBeVisible();
    await expect(page).not.toHaveURL(/#c=/); // the code is removed from the address bar
    for (let i = 1; i <= 6; i++) await expect(page.getByLabel(`Chữ số ${i}`)).not.toHaveValue('');
    await page.getByLabel('Mật khẩu', { exact: true }).fill('mat-khau-giao-vien');
    await page.getByLabel('Nhập lại mật khẩu').fill('mat-khau-giao-vien');
    await page.getByRole('button', { name: 'Kích hoạt tài khoản' }).click();
    await expect(page.getByRole('heading', { name: `Xin chào, ${s.newTeacher.name}` })).toBeVisible();
    await expect(page.locator('header nav').getByRole('link', { name: 'Tổ chức' })).toBeVisible();
  });
});
