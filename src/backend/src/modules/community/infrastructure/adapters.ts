import { Injectable } from '@nestjs/common';
import type { Actor } from '../../../shared/application/actor.js';
import { SessionFacade } from '../../assessment/application/session.facade.js';
import { ClassroomFacade } from '../../classroom/application/classroom.facade.js';
import { ClassMembership, SessionDirectory } from '../application/ports.js';

@Injectable()
export class ClassroomMembership extends ClassMembership {
  constructor(private readonly classrooms: ClassroomFacade) {
    super();
  }

  async status(classId: string) {
    return (await this.classrooms.getClasses([classId])).get(classId)?.status ?? null;
  }

  canManage(actor: Actor, classId: string) {
    return this.classrooms.canManage(actor, classId);
  }

  membership(userId: string, classId: string) {
    return this.classrooms.membership(userId, classId);
  }

  activeManagedClassIds(actor: Actor) {
    return this.classrooms.activeManagedClassIds(actor);
  }
}

@Injectable()
export class AssessmentSessionDirectory extends SessionDirectory {
  constructor(private readonly sessions: SessionFacade) {
    super();
  }

  summary(sessionId: string) {
    return this.sessions.summary(sessionId);
  }
}
