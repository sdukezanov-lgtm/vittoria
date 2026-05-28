import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminUsersService } from './admin-users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users.query.dto';
import type { User } from '@prisma/client';

interface UserResponse {
  id: string;
  phone: string | null;
  role: string;
  first_name: string | null;
  last_name: string | null;
  created_at: string;
}

function toUserResponse(u: User): UserResponse {
  return {
    id: u.id,
    phone: u.phone,
    role: u.role,
    first_name: u.firstName,
    last_name: u.lastName,
    created_at: u.createdAt.toISOString(),
  };
}

@Controller('admin/users')
@Roles('admin')
export class AdminUsersController {
  constructor(private readonly adminUsers: AdminUsersService) {}

  @Get()
  async list(
    @Query() query: ListUsersQueryDto,
  ): Promise<{ rows: UserResponse[]; total: number; page: number; page_size: number }> {
    const result = await this.adminUsers.listUsers({
      role: query.role,
      page: query.page,
      page_size: query.page_size,
    });
    return {
      rows: result.rows.map(toUserResponse),
      total: result.total,
      page: result.page,
      page_size: result.page_size,
    };
  }

  @Post()
  async create(@Body() dto: CreateUserDto): Promise<UserResponse> {
    const u = await this.adminUsers.createUser(dto);
    return toUserResponse(u);
  }
}
