const WEAK_ADMIN_PASSWORDS = new Set([
  'admin12345', 'admin123', 'admin1234', 'password', 'password1', 'password123', '12345678', '123456789', '1234567890',
  'qwerty123', 'admin', 'changeme', 'letmein123',
]);
const MIN_ADMIN_PASSWORD_LENGTH = 12;

/** What is wrong with a password chosen for the administrator account, or null when it is acceptable. */
export function adminPasswordProblem(password: string): string | null {
  if (WEAK_ADMIN_PASSWORDS.has(password.toLowerCase())) return 'ADMIN_PASSWORD is a well-known default.';
  if (password.length < MIN_ADMIN_PASSWORD_LENGTH) return `ADMIN_PASSWORD is shorter than ${MIN_ADMIN_PASSWORD_LENGTH} characters.`;
  return null;
}
