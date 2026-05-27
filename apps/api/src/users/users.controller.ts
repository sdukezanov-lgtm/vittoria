import { Body, Controller, Delete, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateMeDto } from './dto/update-me.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/types/auth-user';

@Controller('me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async me(@CurrentUser() user: AuthUser) {
    const u = await this.users.findById(user.id);
    return {
      id: u.id,
      phone: u.phone,
      role: u.role,
      first_name: u.firstName,
      last_name: u.lastName,
      consent_accepted_at: u.consentAcceptedAt,
    };
  }

  @Patch()
  async update(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto) {
    const u = await this.users.update(user.id, dto);
    return {
      id: u.id,
      phone: u.phone,
      role: u.role,
      first_name: u.firstName,
      last_name: u.lastName,
    };
  }

  @Post('consent')
  @HttpCode(204)
  async consent(@CurrentUser() user: AuthUser): Promise<void> {
    await this.users.recordConsent(user.id);
  }

  @Delete()
  @HttpCode(204)
  async deleteMe(@CurrentUser() user: AuthUser): Promise<void> {
    await this.users.anonymize(user.id);
  }
}
