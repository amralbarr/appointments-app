import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

// applied per-route (@UseGuards(AdminGuard)) on top of the existing
// global AuthGuard/ScopesGuard chain, never registered globally -
// ordinary routes never pay this check. an api key can never satisfy
// this, even one belonging to a user whose own role is ADMIN - AuthGuard
// never sets request.user.role on the api-key path at all.
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    if (user?.role !== 'ADMIN') throw new ForbiddenException('Admin only.');
    return true;
  }
}
