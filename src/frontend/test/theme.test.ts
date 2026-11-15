import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { nextPreference, parsePreference, resolveTheme, THEME_BOOT_SCRIPT, THEME_KEY } from '../src/lib/theme';

/** OJ-19: the theme preference, the pre-paint boot script, and the dark palette's contrast. */

test('the preference is system unless light or dark was chosen; the switch cycles system, light, dark', () => {
  assert.equal(parsePreference(null), 'system');
  assert.equal(parsePreference('dark'), 'dark');
  assert.equal(parsePreference('light'), 'light');
  assert.equal(parsePreference('neon'), 'system');
  assert.deepEqual([nextPreference('system'), nextPreference('light'), nextPreference('dark')], ['light', 'dark', 'system']);
});

test('system follows the OS; printed pages are always light', () => {
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('dark', true, '/bank/sets/abc/print'), 'light');
  assert.equal(resolveTheme('dark', true, '/bank/sets/abc/answer-key'), 'light');
  assert.equal(resolveTheme('dark', true, '/bank/sets/abc'), 'dark');
});

/** Runs the boot script against a fake browser and returns the theme it set. */
function boot(stored: string | null, systemDark: boolean, pathname = '/', storageThrows = false): string | undefined {
  const html = { dataset: {} as Record<string, string> };
  const env = {
    localStorage: { getItem: (k: string) => { if (storageThrows) throw new Error('blocked'); return k === THEME_KEY ? stored : null; } },
    matchMedia: () => ({ matches: systemDark }),
    location: { pathname },
    document: { documentElement: html },
  };
  new Function('localStorage', 'matchMedia', 'location', 'document', THEME_BOOT_SCRIPT)(env.localStorage, env.matchMedia, env.location, env.document);
  return html.dataset.theme;
}

test('the boot script resolves the theme exactly like resolveTheme', () => {
  for (const stored of [null, 'light', 'dark', 'junk']) {
    for (const dark of [true, false]) {
      for (const path of ['/', '/bank/sets/x/print']) {
        assert.equal(boot(stored, dark, path), resolveTheme(parsePreference(stored), dark, path), `${stored} ${dark} ${path}`);
      }
    }
  }
  assert.equal(boot('dark', true, '/', true), 'light', 'blocked storage falls back to light, never throws');
});

// ------------------------------------------------------------------ contrast (WCAG 2.x)

const css = readFileSync(join(__dirname, '../src/app/globals.css'), 'utf8');
const darkBlock = css.slice(css.indexOf(":root[data-theme='dark'] {"), css.indexOf('}', css.indexOf(":root[data-theme='dark'] {")));
const dark = Object.fromEntries([...darkBlock.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]));

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

test('dark theme: text roles meet 4.5:1 on the backgrounds they are used on', () => {
  const pairs: [string, string][] = [
    ['graphite', 'paper'], ['graphite', 'surface'],
    ['slate-500', 'surface'], ['slate-500', 'paper'], ['slate-500', 'slate-50'], ['slate-600', 'slate-100'], ['slate-700', 'slate-100'],
    ['ink-600', 'surface'], ['ink-700', 'ink-50'], ['ink-700', 'ink-100'],
    ['chalk-700', 'chalk-50'], ['chalk-600', 'surface'], ['chalk-700', 'surface'],
    ['mark-600', 'surface'], ['mark-700', 'mark-50'], ['mark-700', 'surface'],
    ['amber-800', 'amber-50'], ['amber-800', 'amber-100'], ['amber-900', 'amber-50'],
    ['sky-800', 'sky-50'], ['sky-700', 'surface'], ['orange-700', 'orange-100'], ['purple-700', 'purple-100'],
  ];
  const low = pairs.map(([fg, bg]) => [fg, bg, contrast(dark[fg], dark[bg])] as const).filter(([, , c]) => c < 4.5);
  assert.deepEqual(low.map(([fg, bg, c]) => `${fg} on ${bg}: ${c.toFixed(2)}`), []);
});

test('dark theme: white text on every solid fill meets 4.5:1', () => {
  for (const solid of ['ink-solid', 'ink-solid-hover', 'chalk-solid', 'chalk-solid-hover', 'mark-solid', 'mark-solid-hover']) {
    assert.ok(contrast('#ffffff', dark[solid]) >= 4.5, `${solid}: ${contrast('#ffffff', dark[solid]).toFixed(2)}`);
  }
});

test('dark theme: every shade a component uses is redefined (no light tint left on the dark board)', () => {
  const source = readFileSync(join(__dirname, '../src/app/globals.css'), 'utf8');
  assert.match(source, /@media screen \{\s*:root\[data-theme='dark'\]/, 'screens only: printing stays light');
  for (const family of ['slate', 'ink', 'chalk', 'mark', 'amber']) {
    for (const shade of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]) assert.ok(dark[`${family}-${shade}`], `${family}-${shade}`);
  }
});
