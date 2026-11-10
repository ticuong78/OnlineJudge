import type { Language } from '@oj/contracts';
import { extendTailwindMerge } from 'tailwind-merge';
import { intlTag, tr } from '@/i18n/runtime';

const twMerge = extendTailwindMerge({
  extend: { theme: { radius: ['control', 'panel'] } },
});

/** Join class names; later Tailwind utilities override conflicting earlier ones (e.g. w-full + w-auto). */
export function cn(...classes: (string | false | null | undefined)[]) {
  return twMerge(classes.filter(Boolean).join(' '));
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(intlTag(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(intlTag());
}

export function formatTime(ms: number | null | undefined) {
  if (ms === null || ms === undefined) return '—';
  return `${ms} ms`;
}

export function formatMemory(kb: number | null | undefined) {
  if (kb === null || kb === undefined) return '—';
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${kb} KB`;
}

export function formatPoints(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * Points earned on a problem from its best score (a percentage), rounded to 2 decimals exactly like the
 * backend's results board (session.service.ts), so a student and their teacher always see the same number.
 */
export function earnedPoints(bestPercent: number, problemPoints: number) {
  return Math.round(bestPercent * problemPoints) / 100;
}

/**
 * How to show a submission's score (a percentage). With the problem's points known: the points earned out of them, the
 * same number as the problem list and the results board ("36/60"). Otherwise an explicit percentage ("60%"), never a
 * bare number that reads like points (K-1).
 */
export function scoreLabel(percent: number, problemPoints?: number | null): { value: string; unit: string; spoken: string } {
  if (problemPoints === undefined || problemPoints === null) {
    const value = formatPoints(percent);
    return { value, unit: '%', spoken: tr()('common.score.percentSpoken', { value }) };
  }
  const value = formatPoints(earnedPoints(percent, problemPoints));
  const of = formatPoints(problemPoints);
  return { value, unit: `/${of}`, spoken: tr()('common.score.pointsSpoken', { value, of }) };
}

/** A plan's last day (YYYY-MM-DD) as dd/mm/yyyy, without any time-zone shift. */
export function formatPlanDate(date: string) {
  const [y, m, d] = date.split('-');
  return y && m && d ? `${d}/${m}/${y}` : date;
}

/** ISO string -> value for <input type="datetime-local"> (local time). */
export function isoToLocalInput(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> value -> ISO string (or null). */
export function localInputToIso(v: string) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const MonacoLanguage: Record<Language, string> = {
  cpp: 'cpp',
  c: 'c',
  python: 'python',
  java: 'java',
  javascript: 'javascript',
};

export const CodeTemplates: Record<Language, string> = {
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    return 0;
}
`,
  c: `#include <stdio.h>

int main(void) {

    return 0;
}
`,
  python: `import sys
input = sys.stdin.readline


def main():
    pass


main()
`,
  java: `import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));

    }
}
`,
  javascript: `const data = require('fs').readFileSync(0, 'utf8').trim().split(/\\s+/);
let pos = 0;
const next = () => data[pos++];

`,
};

export function storageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore quota errors */
  }
}

export async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

/** Last opened problem (for the "continue" shortcut on the dashboard). */
export interface LastProblem {
  sessionId: string;
  key: string;
  title: string;
  sessionTitle?: string;
}
