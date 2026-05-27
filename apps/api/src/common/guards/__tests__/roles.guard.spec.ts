import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../roles.guard';

const makeCtx = (user: { role: string } | undefined, requiredRoles?: string[]) => {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(requiredRoles),
  } as unknown as Reflector;
  const ctx = {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => null,
    getClass: () => null,
  } as unknown as ExecutionContext;
  return { reflector, ctx };
};

describe('RolesGuard', () => {
  it('passes when no role metadata is set', () => {
    const { reflector, ctx } = makeCtx({ role: 'client' }, undefined);
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('passes when user role is allowed', () => {
    const { reflector, ctx } = makeCtx({ role: 'admin' }, ['admin']);
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('denies when role does not match', () => {
    const { reflector, ctx } = makeCtx({ role: 'client' }, ['admin']);
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(ctx)).toBe(false);
  });
});
