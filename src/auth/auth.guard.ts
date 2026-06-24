import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from './auth.config';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Array<'mesero' | 'cajero' | 'administracion'>) =>
  SetMetadata(ROLES_KEY, roles);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();

    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session?.user) throw new UnauthorizedException();

    req.user = session.user;
    req.session = session.session;

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (requiredRoles?.length) {
      const userRole = (session.user as { role?: string }).role;
      if (!userRole || !requiredRoles.includes(userRole)) {
        throw new ForbiddenException(`Rol requerido: ${requiredRoles.join(', ')}`);
      }
    }

    return true;
  }
}
