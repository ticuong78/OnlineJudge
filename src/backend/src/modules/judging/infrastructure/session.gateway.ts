import { Injectable } from '@nestjs/common';
import type { Actor } from '../../../shared/application/actor.js';
import { SessionFacade } from '../../assessment/application/session.facade.js';
import { SessionGateway } from '../application/ports.js';

@Injectable()
export class AssessmentSessionGateway extends SessionGateway {
  constructor(private readonly sessions: SessionFacade) {
    super();
  }

  prepareSubmission(actor: Actor, sessionId: string, problemKey: string) {
    return this.sessions.prepareSubmission(actor, sessionId, problemKey);
  }

  trialTarget(actor: Actor, sessionId: string, problemKey: string) {
    return this.sessions.trialTarget(actor, sessionId, problemKey);
  }

  canReview(actor: Actor, sessionId: string) {
    return this.sessions.canReview(actor, sessionId);
  }

  judgeTarget(sessionId: string, problemKey: string) {
    return this.sessions.judgeTarget(sessionId, problemKey);
  }

  visibility(actor: Actor, sessionIds: string[]) {
    return this.sessions.visibility(actor, sessionIds);
  }
}
