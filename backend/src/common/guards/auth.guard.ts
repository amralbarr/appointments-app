import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ApiKeysService, API_KEY_PREFIX } from '../../auth/api-keys.service';

// one guard for both credential types, registered globally. a jwt (human
// login, or the short-lived token the mcp gateway forwards) always carries
// scopes ['*']; a raw api key gets verified and carries its own stored
// scopes. either way req.user ends up the same shape — see
// docs/ARCHITECTURE.md, "two shapes, one destination".
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly apiKeys: ApiKeysService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest();

    const header = request.headers.authorization as string | undefined;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

    if (!token) {
      if (isPublic) return true;
      throw new UnauthorizedException('Missing Authorization header.');
    }

    if (token.startsWith(API_KEY_PREFIX)) {
      const { userId, scopes, platformId } = await this.apiKeys.verify(token);
      request.user = { userId, scopes, platformId };
      return true;
    }

    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: process.env.JWT_ACCESS_SECRET,
      });
      // platformId claim only ever present on a jwt minted via
      // issueScopedAccessToken() for the mcp-verify path - a normal
      // human-login jwt never carries one. role is the opposite: only a
      // human-login jwt carries it (issueTokenPair) - the api-key branch
      // above never sets request.user.role at all, so AdminGuard always
      // rejects an api-key-authenticated request regardless of the key
      // owner's actual role.
      request.user = {
        userId: payload.sub,
        scopes: payload.scopes ?? ['*'],
        platformId: payload.platformId,
        role: payload.role,
      };
      return true;
    } catch {
      if (isPublic) return true; // a bad token on a public route just means "anonymous"
      throw new UnauthorizedException('Access token is invalid or expired.');
    }
  }
}
