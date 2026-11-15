import { Injectable } from '@nestjs/common';
import type { Actor } from '../../../shared/application/actor.js';
import type { ResultVisibility } from '../domain/session.js';
import { SessionService, type IntegrityContext, type JudgeTarget } from './session.service.js';

/** Published interface of the Assessment context, used by Judging. */
@Injectable()
export class SessionFacade {
  constructor(private readonly sessions: SessionService) {}

  /** Checks the actor may submit to this session problem now, and returns what the judge needs. */
  prepareSubmission(actor: Actor, sessionId: string, problemKey: string): Promise<JudgeTarget> {
    return this.sessions.prepareSubmission(actor, sessionId, problemKey);
  }

  /** Checks the actor may read this session problem now, and returns its sample tests only (trial runs, OJ-18). */
  trialTarget(actor: Actor, sessionId: string, problemKey: string): Promise<JudgeTarget> {
    return this.sessions.trialTarget(actor, sessionId, problemKey);
  }

  /** Current test data of a session problem (for rejudging; no permission checks); null if it was removed. */
  judgeTarget(sessionId: string, problemKey: string): Promise<JudgeTarget | null> {
    return this.sessions.judgeTarget(sessionId, problemKey);
  }

  /** Settings and problem text for integrity checks; null if the session is gone. */
  integrityContext(sessionId: string, problemKey: string): Promise<IntegrityContext | null> {
    return this.sessions.integrityContext(sessionId, problemKey);
  }

  /** Which class a session belongs to and its problem keys; null if the session is gone. */
  summary(sessionId: string): Promise<{ classId: string | null; title: string; problemKeys: string[] } | null> {
    return this.sessions.summary(sessionId);
  }

  canReview(actor: Actor, sessionId: string): Promise<boolean> {
    return this.sessions.canReview(actor, sessionId);
  }

  /** What the actor may see of their own results, per session. */
  visibility(actor: Actor, sessionIds: string[]): Promise<Map<string, ResultVisibility>> {
    return this.sessions.visibility(actor, sessionIds);
  }
}
