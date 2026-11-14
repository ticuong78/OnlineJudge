import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { PasswordHasher, TokenService, type TokenClaims } from '../application/ports.js';
import type { User } from '../domain/user.js';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

/** scrypt-based hasher (no native dependencies). Format: scrypt$<salt hex>$<hash hex> */
@Injectable()
export class ScryptPasswordHasher extends PasswordHasher {
  async hash(plain: string) {
    const salt = randomBytes(16);
    const hash = await scrypt(plain, salt, 64);
    return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
  }

  async verify(plain: string, stored: string) {
    const [, saltHex, hashHex] = stored.split('$');
    if (!saltHex || !hashHex) return false;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = await scrypt(plain, Buffer.from(saltHex, 'hex'), expected.length);
    return timingSafeEqual(actual, expected);
  }
}

@Injectable()
export class JwtTokenService extends TokenService {
  constructor(private readonly jwt: JwtService) {
    super();
  }

  issue(user: User) {
    return this.jwt.signAsync({ sub: user.id, role: user.role, name: user.displayName, cv: this.credentialOf(user) });
  }

  async verify(token: string): Promise<TokenClaims | null> {
    try {
      const payload = await this.jwt.verifyAsync<{ sub?: string; cv?: string }>(token);
      if (!payload.sub || !payload.cv) return null;
      return { userId: payload.sub, credential: payload.cv };
    } catch {
      return null;
    }
  }

  credentialOf(user: User): string {
    // Derived from the password hash, so no extra column is needed and nothing secret is exposed:
    // 64 bits of a SHA-256 of the hash tell nothing about the password.
    return createHash('sha256').update(user.passwordHash).digest('hex').slice(0, 16);
  }
}
