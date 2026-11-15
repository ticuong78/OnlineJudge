import type { AiPlan } from '@oj/contracts';
import { DomainError } from '../domain/domain-error.js';
import type { Actor } from './actor.js';

/**
 * Full AI access, as before OJ-21: PLUS or UNLIMITED. Needed to turn on the AI-usage check for a session. The one place
 * this rule lives: `AiAccess.allows` and `MeDto.canUseAi` both use it (OJ-26).
 */
export function hasFullAi(plan: AiPlan): boolean {
  return plan === 'PLUS' || plan === 'UNLIMITED';
}

/**
 * Port: how much AI an account may use (OJ-21). Implemented by the Identity context, which looks the account up on
 * every call so an upgrade (or a downgrade, or an organization plan ending) applies at once, without signing in again.
 */
export abstract class AiAccess {
  /** NONE (students), FREE (teachers: a monthly allowance), PLUS (VIP or organization AI), UNLIMITED (administrators). */
  abstract plan(userId: string): Promise<AiPlan>;

  /** Full AI access (`hasFullAi`). */
  async allows(userId: string): Promise<boolean> {
    return hasFullAi(await this.plan(userId));
  }

  /** Throws a 403 explaining the VIP requirement when the actor may not use AI. */
  async ensureAllowed(actor: Actor): Promise<void> {
    if (!(await this.allows(actor.id))) throw aiRequiresVip();
  }
}

export const aiRequiresVip = () =>
  DomainError.forbidden('ai.vip_required', 'Tính năng AI chỉ dành cho tài khoản giáo viên VIP. Hãy liên hệ quản trị viên để nâng cấp.');
