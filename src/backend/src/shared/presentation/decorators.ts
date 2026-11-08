import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Role } from '@oj/contracts';
import type { Actor } from '../application/actor.js';
import { clientAddress } from './client-address.js';

export const IS_PUBLIC = 'oj:isPublic';
export const ROLES = 'oj:roles';

/** Route does not require authentication. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Route requires one of the given roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

/**
 * The key the caller is limited under: their IP as Express sees it (IPv6 clients: their /64, see client-address.ts).
 * Behind a reverse proxy this is only the real client when `TRUST_PROXY` is configured (see main.ts);
 * otherwise it is the proxy's address.
 */
export const ClientIp = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string => clientAddress(ctx.switchToHttp().getRequest().ip),
);

/** Injects the authenticated Actor (set by the auth guard). */
export const CurrentActor = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Actor => ctx.switchToHttp().getRequest().actor,
);
