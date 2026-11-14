import { storageGet, storageSet } from './utils';

/** Editor font sizes offered by A−/A+ (OJ-17). 14 is the default. */
export const FONT_SIZES = [12, 13, 14, 15, 16, 18, 20] as const;
const FONT_KEY = 'oj:editor-font';
const SPLIT_KEY = 'oj:solve-split';
/** Statement width as a percentage of the solve page; outside these bounds one side becomes unusable. */
export const SPLIT_MIN = 25;
export const SPLIT_MAX = 75;
export const SPLIT_DEFAULT = 50;

/** The next font size up (+1) or down (-1), staying within FONT_SIZES. */
export function stepFontSize(current: number, direction: 1 | -1): number {
  const i = FONT_SIZES.findIndex((s) => s >= current);
  const at = i < 0 ? FONT_SIZES.length - 1 : i;
  const next = Math.min(FONT_SIZES.length - 1, Math.max(0, at + direction));
  return FONT_SIZES[next];
}

export function clampSplit(percent: number): number {
  if (!Number.isFinite(percent)) return SPLIT_DEFAULT;
  return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, Math.round(percent * 10) / 10));
}

export function readFontSize(): number {
  const n = Number(storageGet(FONT_KEY));
  return (FONT_SIZES as readonly number[]).includes(n) ? n : 14;
}
export const saveFontSize = (n: number) => storageSet(FONT_KEY, String(n));

export function readSplit(): number {
  const raw = storageGet(SPLIT_KEY);
  return raw === null ? SPLIT_DEFAULT : clampSplit(Number(raw));
}
export const saveSplit = (n: number) => storageSet(SPLIT_KEY, String(clampSplit(n)));
