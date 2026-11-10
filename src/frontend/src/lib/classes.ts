import type { ClassroomDto } from '@oj/contracts';

/** Class join codes: 4–20 chars, A–Z 0–9 and "-", case-insensitive (see docs/API.md). */
export const CLASS_CODE_RE = /^[A-Z0-9-]{4,20}$/;

/** Uppercase and drop characters a class code cannot contain (diacritics are stripped, đ -> D). */
export function normalizeClassCode(raw: string) {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\u0111\u0110]/g, 'D') // đ and Đ do not decompose under NFD (i18n-ignore: data)
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 20);
}

/**
 * Suggest a code from the class name: initials of words plus any numbers,
 * e.g. "Tin học 11A1" -> "TH11A1", padded with random digits to at least 6 chars.
 */
export function suggestClassCode(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  let code = '';
  for (const w of words) {
    const clean = normalizeClassCode(w);
    if (!clean) continue;
    code += /\d/.test(clean) ? clean : clean[0];
  }
  code = code.slice(0, 14);
  while (code.length < 6) code += String(Math.floor(Math.random() * 10));
  return code;
}

/**
 * Student view of GET /classes: classes they are in now (and still running), and history —
 * classes they left or that were archived. Both sorted by name.
 */
export function splitStudentClasses(list: ClassroomDto[]) {
  const byName = (a: ClassroomDto, b: ClassroomDto) => a.name.localeCompare(b.name, 'vi');
  const isActiveMember = (c: ClassroomDto) => c.isCurrent !== false && c.status === 'ACTIVE';
  return {
    current: list.filter(isActiveMember).sort(byName),
    history: list.filter((c) => !isActiveMember(c)).sort(byName),
  };
}
