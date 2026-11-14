import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { VerificationRepository } from '../domain/user.repository.js';

const SWEEP_EVERY_MS = 60 * 60_000;
/** Kept a day past expiry, so a ticket a user is still looking at answers "expired" rather than "unknown". */
const KEEP_AFTER_EXPIRY_MS = 24 * 60 * 60_000;

/**
 * Deletes sign-up and password-reset tickets long past their expiry.
 *
 * Every sign-up and every "forgot password" stores a ticket, also for addresses with no account (so the answers
 * do not reveal which addresses exist). Without this, anyone could grow the table by submitting addresses.
 * Teacher invitations are left alone: the administrator still sees expired ones and may send them again.
 */
@Injectable()
export class VerificationSweeper implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VerificationSweeper.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly verifications: VerificationRepository) {}

  onModuleInit() {
    void this.sweep(); // also at start-up: a server restarted more often than hourly would otherwise never sweep
    this.timer = setInterval(() => void this.sweep(), SWEEP_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  /** One pass. Returns how many tickets were deleted. Never throws: the next pass tries again. */
  async sweep(now = new Date()): Promise<number> {
    try {
      return await this.verifications.deleteExpired(['REGISTER_STUDENT', 'RESET_PASSWORD'], new Date(now.getTime() - KEEP_AFTER_EXPIRY_MS));
    } catch (error) {
      this.logger.error(`Verification sweep failed: ${(error as Error).message}`);
      return 0;
    }
  }
}
