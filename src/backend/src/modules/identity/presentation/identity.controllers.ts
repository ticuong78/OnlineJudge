import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { IsBoolean, IsEmail, IsOptional, IsString, IsUUID, Length, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import type { Actor } from '../../../shared/application/actor.js';
import { ClientIp, CurrentActor, Public, Roles } from '../../../shared/presentation/decorators.js';
import { bodyField, RateLimit, type RouteRateLimit } from '../../../shared/presentation/rate-limit.js';
import { AccountService } from '../application/account.service.js';
import {
  FORGOT_PER_EMAIL,
  FORGOT_PER_IP,
  INVITATION_PREVIEW_PER_IP,
  RESEND_PER_IP,
  RESEND_PER_VERIFICATION,
  VERIFY_PER_IP,
} from '../application/rate-limits.js';
import { TeamService } from '../application/team.service.js';

const PASSWORD_MSG = { message: 'Mật khẩu phải có ít nhất 6 ký tự.' };
const EMAIL_MSG = { message: 'Email không hợp lệ.' };
const CODE_MSG = { message: 'Mã xác thực gồm 6 chữ số.' };
const LINK_MSG = { message: 'Liên kết xác thực không hợp lệ. Hãy mở lại liên kết trong email.' };

class LoginBody {
  @IsEmail({}, EMAIL_MSG) email: string;
  @IsString() password: string;
}

class VerifyCodeBody {
  @IsUUID() verificationId: string;
  @Matches(/^\s*\d{6}\s*$/, CODE_MSG) code: string;
}

class ResendBody {
  @IsUUID() verificationId: string;
}

class ForgotPasswordBody {
  @IsEmail({}, EMAIL_MSG) email: string;
}

/** From the reset email's link: the ticket and its secret (32 random bytes, base64url). */
class ResetPasswordBody {
  @IsUUID() verificationId: string;
  @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/, LINK_MSG) token: string;
  @IsString() @MinLength(6, PASSWORD_MSG) @MaxLength(128) newPassword: string;
}

class AcceptInvitationBody {
  @IsUUID() invitationId: string;
  @Matches(/^\s*\d{6}\s*$/, CODE_MSG) code: string;
  @IsString() @MinLength(6, PASSWORD_MSG) @MaxLength(128) password: string;
}

class InviteTeacherBody {
  @IsEmail({}, EMAIL_MSG) email: string;
  @IsString() @Length(2, 80, { message: 'Họ tên phải từ 2 đến 80 ký tự.' }) displayName: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(20) phone: string | null = null;
}

class SetVipBody {
  @IsBoolean() vip: boolean;
}

/** Typing a one-time code: limited per IP only (see rate-limits.ts for why not per verification). */
const typingCode: RouteRateLimit = { name: 'verify', perIp: VERIFY_PER_IP };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly accounts: AccountService,
    private readonly team: TeamService,
  ) {}

  /** Throttled inside the use case: only wrong passwords count against the client. */
  @Public() @Post('login') @HttpCode(200)
  login(@Body() body: LoginBody, @ClientIp() ip: string) {
    return this.accounts.login(body.email, body.password, ip);
  }

  @Get('me')
  me(@CurrentActor() actor: Actor) {
    return this.accounts.me(actor);
  }

  @Public() @Post('register/verify') @HttpCode(200)
  @RateLimit(typingCode)
  verifyRegistration(@Body() body: VerifyCodeBody) {
    return this.accounts.completeRegistration(body.verificationId, body.code);
  }

  @Public() @Post('verification/resend') @HttpCode(200)
  @RateLimit({ name: 'resend', perIp: RESEND_PER_IP, perTarget: { policy: RESEND_PER_VERIFICATION, of: (req) => bodyField(req, 'verificationId') } })
  resend(@Body() body: ResendBody) {
    return this.accounts.resendCode(body.verificationId);
  }

  @Public() @Post('password/forgot') @HttpCode(202)
  @RateLimit({ name: 'forgot', perIp: FORGOT_PER_IP, perTarget: { policy: FORGOT_PER_EMAIL, of: (req) => bodyField(req, 'email') } })
  forgotPassword(@Body() body: ForgotPasswordBody) {
    return this.accounts.forgotPassword(body.email);
  }

  @Public() @Post('password/reset') @HttpCode(200)
  @RateLimit(typingCode)
  resetPassword(@Body() body: ResetPasswordBody, @ClientIp() ip: string) {
    return this.accounts.resetPassword(body.verificationId, body.token, body.newPassword, ip);
  }

  @Public() @Get('invitations/:id')
  @RateLimit({ name: 'invitation-preview', perIp: INVITATION_PREVIEW_PER_IP })
  previewInvitation(@Param('id', ParseUUIDPipe) id: string) {
    return this.team.previewInvitation(id);
  }

  @Public() @Post('invitations/accept') @HttpCode(200)
  @RateLimit(typingCode)
  acceptInvitation(@Body() body: AcceptInvitationBody) {
    return this.team.acceptInvitation(body.invitationId, body.code, body.password);
  }
}

@Controller('users')
@Roles('ADMIN')
export class UsersController {
  constructor(private readonly team: TeamService) {}

  @Get()
  list() {
    return this.team.listUsers();
  }

  /** Upgrade a teacher to VIP (AI features) or back to a regular account. */
  @Put(':id/vip')
  setVip(@Param('id', ParseUUIDPipe) id: string, @Body() body: SetVipBody) {
    return this.team.setVip(id, body.vip);
  }

  @Delete(':id') @HttpCode(204)
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.team.deleteUser(id);
  }

  @Get('invitations')
  invitations() {
    return this.team.listInvitations();
  }

  @Post('invitations')
  invite(@Body() body: InviteTeacherBody) {
    return this.team.invite(body);
  }

  @Post('invitations/:id/resend') @HttpCode(200)
  resendInvitation(@Param('id', ParseUUIDPipe) id: string) {
    return this.team.resendInvitation(id);
  }

  @Delete('invitations/:id') @HttpCode(204)
  cancelInvitation(@Param('id', ParseUUIDPipe) id: string) {
    return this.team.cancelInvitation(id);
  }
}
