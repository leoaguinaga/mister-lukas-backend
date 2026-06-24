import { Global, Module } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { AuthGuard } from './auth.guard';
import { auth } from './auth.config';

export const AUTH = Symbol('AUTH');

@Global()
@Module({
  providers: [
    Reflector,
    AuthGuard,
    {
      provide: AUTH,
      useValue: auth,
    },
  ],
  exports: [AUTH, AuthGuard],
})
export class AuthModule {}
