import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const SALT_ROUNDS = 10;

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('An account with this email already exists.');

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: { email: dto.email, passwordHash, name: dto.name },
    });

    return this.issueTokenPair(user.id, user.role);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    // same error either way — don't tell a caller whether the email exists
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Incorrect email or password.');
    }
    return this.issueTokenPair(user.id, user.role);
  }

  async refresh(userId: string, refreshToken: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.refreshTokenHash || user.refreshTokenHash !== hashToken(refreshToken)) {
      // either never logged in, already rotated past this token, or logged out
      throw new UnauthorizedException('Refresh token is no longer valid.');
    }
    return this.issueTokenPair(user.id, user.role);
  }

  async logout(userId: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { refreshTokenHash: null } });
  }

  // role rides the access token only, same as scopes - never the refresh
  // token, which only ever carries sub. see AdminGuard: the api-key auth
  // path never sets this claim at all, regardless of the key's owner's
  // actual role.
  private async issueTokenPair(userId: string, role: UserRole) {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, scopes: ['*'], role },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: process.env.JWT_ACCESS_TTL ?? '15m' },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: userId },
      { secret: process.env.JWT_REFRESH_SECRET, expiresIn: process.env.JWT_REFRESH_TTL ?? '30d' },
    );

    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: hashToken(refreshToken) },
    });

    return { accessToken, refreshToken };
  }

  // the token handed back from /auth/mcp/verify — carries the api key's own
  // scopes, not ['*'], since the gateway forwards exactly this on every
  // tool call. see docs/MCP-INTEGRATION.md. platformId is only included
  // when the key itself was platform-scoped - see ADR-001.
  async issueScopedAccessToken(userId: string, scopes: string[], platformId?: string) {
    return this.jwt.signAsync(
      { sub: userId, scopes, ...(platformId ? { platformId } : {}) },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: process.env.JWT_ACCESS_TTL ?? '15m' },
    );
  }

  async verifyRefreshToken(token: string): Promise<{ userId: string }> {
    try {
      const payload = await this.jwt.verifyAsync(token, { secret: process.env.JWT_REFRESH_SECRET });
      return { userId: payload.sub };
    } catch {
      throw new UnauthorizedException('Refresh token is invalid or expired.');
    }
  }
}
