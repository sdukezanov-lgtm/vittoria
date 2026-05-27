import { Controller, Delete, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Body } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';

@Controller('me/push-tokens')
@Roles('client')
export class PushTokensController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  async register(
    @CurrentUser() user: AuthUser,
    @Body() dto: RegisterPushTokenDto,
  ): Promise<{ id: string; platform: string; device_id: string }> {
    const row = await this.prisma.pushToken.upsert({
      where: { userId_deviceId: { userId: user.id, deviceId: dto.device_id } },
      update: { token: dto.token, platform: dto.platform },
      create: { userId: user.id, deviceId: dto.device_id, token: dto.token, platform: dto.platform },
    });
    return { id: row.id, platform: row.platform, device_id: row.deviceId };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    const result = await this.prisma.pushToken.deleteMany({ where: { id, userId: user.id } });
    if (result.count === 0) {
      throw new NotFoundException({ code: 'PUSH_TOKEN_NOT_FOUND', message: 'token not found' });
    }
  }
}
