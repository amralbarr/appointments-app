import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

export const API_KEY_PREFIX = 'sk_live_';

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateApiKeyDto) {
    const random = randomBytes(32).toString('base64url');
    const rawKey = `${API_KEY_PREFIX}${random}`;
    const lookupPrefix = random.slice(0, 8);

    const key = await this.prisma.apiKey.create({
      data: {
        userId,
        prefix: lookupPrefix,
        hashedKey: sha256(rawKey),
        label: dto.label,
        scopes: dto.scopes,
      },
    });

    // the only time the raw key is ever available again — caller has to
    // save it now, same as every other provider's api key UX.
    return {
      id: key.id,
      rawKey,
      label: key.label,
      scopes: key.scopes,
      createdAt: key.createdAt,
    };
  }

  async listForUser(userId: string) {
    const keys = await this.prisma.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return keys.map(({ hashedKey, ...rest }) => rest);
  }

  async revoke(userId: string, keyId: string) {
    const key = await this.prisma.apiKey.findFirst({ where: { id: keyId, userId } });
    if (!key) throw new NotFoundException('No such API key.');
    if (key.revokedAt) return; // already revoked, nothing to do

    await this.prisma.apiKey.update({
      where: { id: keyId },
      data: { revokedAt: new Date() },
    });
  }

  // used by both the ApiKeyGuard path and /auth/mcp/verify — see
  // docs/AUTH-AND-API-KEYS.md for why this one lookup backs both.
  async verify(
    rawKey: string,
  ): Promise<{ userId: string; scopes: string[]; platformId?: string }> {
    if (!rawKey.startsWith(API_KEY_PREFIX)) {
      throw new UnauthorizedException('Not a recognized API key.');
    }

    const random = rawKey.slice(API_KEY_PREFIX.length);
    const lookupPrefix = random.slice(0, 8);
    const hashedKey = sha256(rawKey);

    const candidates = await this.prisma.apiKey.findMany({
      where: { prefix: lookupPrefix, revokedAt: null },
    });
    const match = candidates.find((k) => k.hashedKey === hashedKey);
    if (!match) throw new UnauthorizedException('API key is invalid or revoked.');

    // best-effort, never block the request on this
    this.prisma.apiKey
      .update({ where: { id: match.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    return { userId: match.userId, scopes: match.scopes, platformId: match.platformId ?? undefined };
  }
}
