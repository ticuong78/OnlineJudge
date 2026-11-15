import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@oj/contracts';
import { DomainError } from '../../../shared/domain/domain-error.js';
import { IS_PUBLIC, ROLES } from '../../../shared/presentation/decorators.js';
import { Authenticator } from '../application/authenticator.js';

/** Global guard: authenticates the bearer token and enforces @Roles(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authenticator: Authenticator,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    const actor = token ? await this.authenticator.authenticate(token) : null;
    if (!actor) throw DomainError.unauthorized('auth.required', 'Vui lòng đăng nhập.');
    req.actor = actor;

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, targets);
    if (roles && !roles.includes(actor.role)) {
      throw DomainError.forbidden('auth.forbidden', 'Bạn không có quyền thực hiện thao tác này.');
    }
    return true;
  }
}
