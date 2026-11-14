import type { VerificationTicketDto } from '@oj/contracts';
import { randomUUID } from 'node:crypto';
import type { Email } from '../domain/user.js';
import { RESEND_COOLDOWN_MS, VERIFICATION_POLICY } from '../domain/verification.js';

interface Decoy {
  id: string;
  sentAt: number;
}

/**
 * Answers "forgot password" for an address that has no account the way a real account would be answered:
 * the same ticket (same id, same times) when asked again within the cooldown, a refreshed one afterwards.
 * Without this, asking twice told real and unknown addresses apart (a fresh id every time vs. the same one).
 *
 * Kept in memory with a size bound; losing it on restart only makes the next answer look like a new request.
 */
export class DecoyTickets {
  private readonly decoys = new Map<string, Decoy>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly maxEntries = 10_000,
  ) {}

  ticketFor(email: Email): VerificationTicketDto {
    const now = this.now();
    let decoy = this.decoys.get(email.value);
    if (!decoy) decoy = { id: randomUUID(), sentAt: now };
    else if (now >= decoy.sentAt + RESEND_COOLDOWN_MS) decoy = { id: decoy.id, sentAt: now }; // a real account would get a fresh code here

    this.decoys.delete(email.value);
    this.decoys.set(email.value, decoy);
    while (this.decoys.size > this.maxEntries) this.decoys.delete(this.decoys.keys().next().value as string);

    return {
      verificationId: decoy.id,
      email: email.value,
      expiresAt: new Date(decoy.sentAt + VERIFICATION_POLICY.RESET_PASSWORD.ttlMs).toISOString(),
      resendAvailableAt: new Date(decoy.sentAt + RESEND_COOLDOWN_MS).toISOString(),
    };
  }
}
