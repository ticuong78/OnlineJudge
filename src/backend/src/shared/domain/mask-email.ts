/**
 * "n***@truong.vn": enough to tell a mistyped domain from a mail outage, without logging who it was
 * (CLAUDE.md security rule 6).
 */
export function maskEmail(address: string): string {
  const at = address.lastIndexOf('@');
  return at > 0 ? `${address[0]}***${address.slice(at)}` : '***';
}

/** Masks every email address inside free text, such as an SMTP server's error reply that echoes the recipient. */
export function maskEmailsIn(text: string): string {
  return text.replace(/[^\s<>"'(),;:]+@[^\s<>"'(),;:]+/g, maskEmail);
}
