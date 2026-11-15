import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import type { OrganizationRole } from '@oj/contracts';
import { IsBoolean, IsEmail, IsIn, IsInt, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';
import type { Actor } from '../../../shared/application/actor.js';
import { CurrentActor, Roles } from '../../../shared/presentation/decorators.js';
import { RateLimit } from '../../../shared/presentation/rate-limit.js';
import { ORGANIZATION_INVITES_PER_IP } from '../application/rate-limits.js';
import { MAX_SEATS } from '../domain/organization.js';
import { OrganizationService } from '../application/organization.service.js';

const ROLES: OrganizationRole[] = ['ADMIN', 'TEACHER'];
const DATE_MSG = { message: 'Ngày hết hạn phải có dạng YYYY-MM-DD.' };

class UpsertOrganizationBody {
  @IsString() @Length(2, 120, { message: 'Tên tổ chức phải từ 2 đến 120 ký tự.' }) name: string;
  @IsInt() @Min(1) @Max(MAX_SEATS) seats: number;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/, DATE_MSG) activeUntil: string;
  @IsBoolean() aiIncluded: boolean;
}

class CreateOrganizationBody extends UpsertOrganizationBody {
  @IsUUID() adminUserId: string;
}

class InviteToOrganizationBody {
  @IsEmail({}, { message: 'Email không hợp lệ.' }) email: string;
  @IsString() @Length(2, 80, { message: 'Họ tên phải từ 2 đến 80 ký tự.' }) displayName: string;
}

class AddMemberBody {
  @IsUUID() userId: string;
  @IsIn(ROLES) role: OrganizationRole;
}

class SetRoleBody {
  @IsIn(ROLES) role: OrganizationRole;
}

/**
 * Organizations (OJ-8). Admin-only routes say so; the rest are open to teachers and the use case checks that the
 * actor is a member (or org admin) of that organization.
 */
@Controller('organizations')
@Roles('ADMIN', 'TEACHER')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationService) {}

  @Get()
  list(@CurrentActor() actor: Actor) {
    return this.organizations.list(actor);
  }

  @Post() @Roles('ADMIN')
  create(@CurrentActor() actor: Actor, @Body() body: CreateOrganizationBody) {
    return this.organizations.create(actor, body);
  }

  @Get(':id')
  detail(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.organizations.detail(actor, id);
  }

  @Put(':id') @Roles('ADMIN')
  update(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpsertOrganizationBody) {
    return this.organizations.update(actor, id, body);
  }

  @Post(':id/members') @Roles('ADMIN')
  addMember(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: AddMemberBody) {
    return this.organizations.addMember(actor, id, body);
  }

  @Put(':id/members/:userId/role')
  setRole(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: SetRoleBody,
  ) {
    return this.organizations.setRole(actor, id, userId, body.role);
  }

  /** Org admin removes a teacher; a teacher removing themselves leaves the organization. */
  @Delete(':id/members/:userId') @HttpCode(204)
  removeMember(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.organizations.removeMember(actor, id, userId);
  }

  @Post(':id/invitations')
  @RateLimit({ name: 'organization-invite', perIp: ORGANIZATION_INVITES_PER_IP })
  invite(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: InviteToOrganizationBody) {
    return this.organizations.invite(actor, id, body);
  }

  @Delete(':id/invitations/:invitationId') @HttpCode(204)
  cancelInvitation(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
  ) {
    return this.organizations.cancelInvitation(actor, id, invitationId);
  }
}

/** Invitations addressed to the signed-in teacher's existing account. */
@Controller('organization-invitations')
@Roles('TEACHER')
export class OrganizationInvitationsController {
  constructor(private readonly organizations: OrganizationService) {}

  @Get('mine')
  mine(@CurrentActor() actor: Actor) {
    return this.organizations.myInvitations(actor);
  }

  @Post(':id/accept') @HttpCode(200)
  accept(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.organizations.accept(actor, id);
  }

  @Post(':id/decline') @HttpCode(204)
  decline(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.organizations.decline(actor, id);
  }
}
