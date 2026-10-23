import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export interface AuthenticatedUser {
  userId: string;
  scopes: string[];
  // set only for a key/token restricted to one platform - see
  // backend/docs/decisions/ADR-001-platform-scoped-key-enforcement.md.
  // a normal human-login jwt never carries one.
  platformId?: string;
  // set only on the jwt path, never on an api key - see AdminGuard. a
  // delegated api key never carries its owner's role, by design.
  role?: UserRole;
}

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
