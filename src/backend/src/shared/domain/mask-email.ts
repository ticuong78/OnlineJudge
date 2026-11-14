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
  // An address ends in a letter (or punycode) top-level domain, and neither part holds "/": stack frames such as
  // ".pnpm/typeorm@0.3.27_pg@8.16.3/node_modules" are paths, not addresses, and stay readable. The end check refuses
  // a following letter, digit or "-", or a dot that continues the domain, but not a full stop that ends a sentence
  // (the OJ-14 version missed "… hs01@truong.edu.vn.", OJ-15 F2).
  return text.replace(EMAIL_IN_TEXT, maskEmail);
}

// Bounded parts (an address has at most 64 characters before "@" and 253 after it, and no second "@" before it):
// unbounded runs made masking quadratic on long text, e.g. 40k characters of "a@a@…" (OJ-15 F2).
const EMAIL_IN_TEXT =
  /[^\s<>"'(),;:/@]{1,64}@[^\s<>"'(),;:/@]{1,253}\.(?:\p{L}{2,63}|xn--[a-z0-9-]{1,59})(?![\p{L}\p{N}_-]|\.[\p{L}\p{N}_-])/giu;

/**
 * What the log gets for an unexpected error: its stack (name, message, frames) with emails masked, nothing else.
 * Never the error object itself: Nest prints an object's own fields, and a database error carries the query's
 * parameters and the driver's detail ("Key (email)=(…)"), that is students' emails and password or code hashes
 * (review B2, CLAUDE.md security rule 6).
 */
const LOG_LIMIT = 8_192;

export function errorForLog(exception: unknown): string {
  // A stack is a few KB; anything longer is a message carrying user text, and only its start is useful in a log.
  if (exception instanceof Error) return maskEmailsIn((exception.stack ?? `${exception.name}: ${exception.message}`).slice(0, LOG_LIMIT));
  return `Non-error thrown (${typeof exception})`;
}
