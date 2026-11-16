/**
 * One CSV cell for files teachers open in Excel or LibreOffice. Quoting alone is not enough: a quoted cell that starts
 * with =, +, -, @, tab or CR still runs as a formula, and student display names reach these files (OJ-31 security
 * review). Such text gets a leading apostrophe, which spreadsheets show as plain text. Numbers are left as they are.
 */
export function csvCell(value: string | number): string {
  const text = typeof value === 'number' ? String(value) : /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${text.replace(/"/g, '""')}"`;
}

/** Rows as CSV with a BOM, so Excel keeps Vietnamese text. */
export function csvFile(rows: (string | number)[][]): string {
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}
