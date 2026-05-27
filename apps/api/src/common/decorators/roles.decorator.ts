import { SetMetadata } from '@nestjs/common';
import type { AuthUser } from '../types/auth-user';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Array<AuthUser['role']>) => SetMetadata(ROLES_KEY, roles);
