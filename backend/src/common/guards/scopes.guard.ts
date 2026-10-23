import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SCOPES_KEY } from '../decorators/scopes.decorator';

@Injectable()
export class ScopesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) return true; // AuthGuard already let this through as public/anonymous

    if (user.scopes.includes('*')) return true;
    const hasAll = required.every((s) => user.scopes.includes(s));
    if (!hasAll) {
      throw new ForbiddenException(`This action needs scope(s): ${required.join(', ')}.`);
    }
    return true;
  }
}
