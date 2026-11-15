import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export const STATE_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.state/browser.json');

export interface Person { email: string; password: string; name: string }
export interface BrowserState {
  admin: Person;
  lan: Person; // teacher, org admin
  minh: Person; // teacher, not yet in the organization
  student: Person; // in class PW-10A1
  sessionId: string;
  problemKey: string;
  organizationId: string;
  /** Emailed link for a brand-new teacher invited into the organization. */
  newTeacher: { name: string; inviteUrl: string };
}

export const state = (): BrowserState => JSON.parse(readFileSync(STATE_FILE, 'utf8'));

/** Signs in through the login form, as a person would. */
export async function signIn(page: Page, who: Person) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Mật khẩu').fill(who.password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('heading', { name: `Xin chào, ${who.name}` })).toBeVisible();
}
