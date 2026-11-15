import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsEmail, IsInt, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import type { Actor } from '../../../shared/application/actor.js';
import type { RateLimitPolicy } from '../../../shared/application/rate-limiter.js';
import { CurrentActor, Public, Roles } from '../../../shared/presentation/decorators.js';
import { bodyField, RateLimit } from '../../../shared/presentation/rate-limit.js';
import { ClassroomService } from '../application/classroom.service.js';

class UpsertClassroomBody {
  @IsString() @Length(1, 100, { message: 'Tên lớp phải từ 1 đến 100 ký tự.' }) name: string;
  @IsString() @Length(4, 20, { message: 'Mã lớp gồm 4–20 ký tự.' }) code: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() teacherId?: string | null;
  /** On create only (OJ-8): one of the creator's organizations; checked against their memberships. */
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() organizationId?: string | null;
}

class MoveToOrganizationBody {
  @IsUUID() organizationId: string;
}

class MoveStudentBody {
  @IsUUID() classId: string;
}

class AddStudentBody {
  @IsEmail({}, { message: 'Email không hợp lệ.' }) email: string;
}

class JoinClassBody {
  @IsString() @Length(1, 40, { message: 'Hãy nhập mã lớp.' }) classCode: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(500) message?: string | null;
}

class LeaveClassBody {
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(500) message?: string | null;
}

class ScheduleDeletionBody {
  @Type(() => Number) @IsInt() @Min(1) @Max(365) days: number;
}

class DeleteNowBody {
  @IsString() confirmName: string;
}

class RegisterBody {
  @IsEmail({}, { message: 'Email không hợp lệ.' }) email: string;
  @IsString() @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự.' }) @MaxLength(128) password: string;
  @IsString() @Length(2, 80, { message: 'Họ tên phải từ 2 đến 80 ký tự.' }) displayName: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(20) phone: string | null = null;
  @IsOptional() @ValidateIf((_, v) => v !== null && v !== '') @IsString() @Length(1, 40) classCode: string | null = null;
}

@Controller('classes')
export class ClassroomsController {
  constructor(private readonly classrooms: ClassroomService) {}

  @Get()
  list(@CurrentActor() actor: Actor) {
    return this.classrooms.list(actor);
  }

  // Literal routes before ":id".
  @Get('unassigned-students') @Roles('ADMIN')
  unassigned() {
    return this.classrooms.unassigned();
  }

  @Put('students/:studentId') @Roles('ADMIN', 'TEACHER')
  addStudent(
    @CurrentActor() actor: Actor,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body() body: MoveStudentBody,
  ) {
    return this.classrooms.addStudent(actor, studentId, body.classId);
  }

  /** Student: ask to join a class by its code. */
  @Post('join') @Roles('STUDENT')
  join(@CurrentActor() actor: Actor, @Body() body: JoinClassBody) {
    return this.classrooms.requestJoin(actor, body.classCode, body.message);
  }

  @Post() @Roles('ADMIN', 'TEACHER')
  create(@CurrentActor() actor: Actor, @Body() body: UpsertClassroomBody) {
    return this.classrooms.create(actor, body);
  }

  @Get(':id')
  get(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.classrooms.get(actor, id);
  }

  @Put(':id') @Roles('ADMIN', 'TEACHER')
  update(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpsertClassroomBody) {
    return this.classrooms.update(actor, id, body);
  }

  /** A personal class joins one of the teacher's organizations (OJ-8, one way). */
  @Put(':id/organization') @Roles('ADMIN', 'TEACHER')
  moveToOrganization(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: MoveToOrganizationBody) {
    return this.classrooms.moveToOrganization(actor, id, body.organizationId);
  }

  @Post(':id/archive') @Roles('ADMIN', 'TEACHER') @HttpCode(200)
  archive(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.classrooms.archive(actor, id);
  }

  @Post(':id/restore') @Roles('ADMIN', 'TEACHER') @HttpCode(200)
  restore(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.classrooms.restore(actor, id);
  }

  @Post(':id/schedule-deletion') @Roles('ADMIN', 'TEACHER') @HttpCode(200)
  scheduleDeletion(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: ScheduleDeletionBody) {
    return this.classrooms.scheduleDeletion(actor, id, body.days);
  }

  @Post(':id/cancel-deletion') @Roles('ADMIN', 'TEACHER') @HttpCode(200)
  cancelDeletion(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.classrooms.cancelDeletion(actor, id);
  }

  @Post(':id/delete-now') @Roles('ADMIN', 'TEACHER') @HttpCode(204)
  deleteNow(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: DeleteNowBody) {
    return this.classrooms.deleteNow(actor, id, body.confirmName);
  }

  @Get(':id/students') @Roles('ADMIN', 'TEACHER')
  roster(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.classrooms.roster(actor, id);
  }

  @Post(':id/students') @Roles('ADMIN', 'TEACHER')
  addByEmail(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: AddStudentBody) {
    return this.classrooms.addStudentByEmail(actor, id, body.email);
  }

  @Delete(':id/students/:studentId') @Roles('ADMIN', 'TEACHER') @HttpCode(204)
  removeStudent(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    return this.classrooms.removeStudent(actor, id, studentId);
  }

  /** Student: ask to leave a class. */
  @Post(':id/leave') @Roles('STUDENT') @HttpCode(201)
  leave(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: LeaveClassBody) {
    return this.classrooms.requestLeave(actor, id, body.message);
  }

  /** Pending join/leave requests of the class. */
  @Get(':id/requests') @Roles('ADMIN', 'TEACHER')
  requests(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.classrooms.classRequests(actor, id);
  }

  @Post(':id/requests/approve-all') @Roles('ADMIN', 'TEACHER') @HttpCode(200)
  async approveAll(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return { approved: await this.classrooms.approveAllJoins(actor, id) };
  }
}

@Controller('membership-requests')
export class MembershipRequestsController {
  constructor(private readonly classrooms: ClassroomService) {}

  @Get('mine') @Roles('STUDENT')
  mine(@CurrentActor() actor: Actor) {
    return this.classrooms.myRequests(actor);
  }

  @Post(':id/approve') @Roles('ADMIN', 'TEACHER') @HttpCode(200)
  approve(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.classrooms.decide(actor, id, true);
  }

  @Post(':id/reject') @Roles('ADMIN', 'TEACHER') @HttpCode(200)
  reject(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.classrooms.decide(actor, id, false);
  }

  @Post(':id/cancel') @Roles('STUDENT') @HttpCode(200)
  cancel(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.classrooms.cancelRequest(actor, id);
  }
}

/**
 * Sign-up sends an email, so it is limited per IP and per mailbox. The per-IP figure leaves room for a whole
 * class behind one school address signing up in the same hour; the per-mailbox one is the 60-second resend
 * pace (a bigger per-mailbox budget would let anyone use up a classmate's allowance for the whole window).
 */
const REGISTER_PER_IP: RateLimitPolicy = { limit: 60, windowMs: 60 * 60_000 };
const REGISTER_PER_EMAIL: RateLimitPolicy = { limit: 2, windowMs: 60_000 };

/** Student sign-up lives here because the class code belongs to the Classroom context. */
@Controller('auth')
export class RegistrationController {
  constructor(private readonly classrooms: ClassroomService) {}

  @Public() @Post('register') @HttpCode(202)
  @RateLimit({ name: 'register', perIp: REGISTER_PER_IP, perTarget: { policy: REGISTER_PER_EMAIL, of: (req) => bodyField(req, 'email') } })
  register(@Body() body: RegisterBody) {
    return this.classrooms.startRegistration(body);
  }
}

/** The classes of an organization, for its org admins and the administrator (OJ-8). */
@Controller('organizations')
export class OrganizationClassesController {
  constructor(private readonly classrooms: ClassroomService) {}

  @Get(':id/classes') @Roles('ADMIN', 'TEACHER')
  classes(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.classrooms.organizationClasses(actor, id);
  }
}
