import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityModule } from '../identity/identity.module.js';
import { ClassroomFacade } from './application/classroom.facade.js';
import { ClassroomService } from './application/classroom.service.js';
import { PeopleDirectory } from './application/ports.js';
import { ClassroomRepository, EnrollmentRepository, MembershipRequestRepository } from './domain/classroom.repository.js';
import {
  ClassroomOrmEntity,
  EnrollmentOrmEntity,
  MembershipRequestOrmEntity,
  TypeOrmClassroomRepository,
  TypeOrmEnrollmentRepository,
  TypeOrmMembershipRequestRepository,
} from './infrastructure/classroom.persistence.js';
import { IdentityPeopleDirectory } from './infrastructure/identity.gateway.js';
import { ClassroomsController, MembershipRequestsController, RegistrationController, OrganizationClassesController } from './presentation/classrooms.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([ClassroomOrmEntity, EnrollmentOrmEntity, MembershipRequestOrmEntity]), IdentityModule],
  controllers: [ClassroomsController, MembershipRequestsController, RegistrationController, OrganizationClassesController],
  providers: [
    ClassroomService,
    ClassroomFacade,
    { provide: ClassroomRepository, useClass: TypeOrmClassroomRepository },
    { provide: EnrollmentRepository, useClass: TypeOrmEnrollmentRepository },
    { provide: MembershipRequestRepository, useClass: TypeOrmMembershipRequestRepository },
    { provide: PeopleDirectory, useClass: IdentityPeopleDirectory },
  ],
  exports: [ClassroomFacade],
})
export class ClassroomModule {}
