import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { RequestCodeDto } from './dto/request-code.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';
import { RefreshDto } from './dto/refresh.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/types/auth-user';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('request-code')
  @HttpCode(200)
  async requestCode(@Body() dto: RequestCodeDto): Promise<{ retry_after_sec: number }> {
    const { retryAfterSec } = await this.auth.requestCode(dto.phone);
    return { retry_after_sec: retryAfterSec };
  }

  @Post('verify-code')
  @HttpCode(200)
  async verifyCode(@Body() dto: VerifyCodeDto): Promise<{
    access_token: string;
    refresh_token: string;
    user: { id: string; phone: string; role: string };
  }> {
    const result = await this.auth.verifyCode(dto.phone, dto.code, dto.device_info ?? {});
    return {
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
      user: result.user,
    };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() dto: RefreshDto): Promise<{ access_token: string; refresh_token: string }> {
    const result = await this.auth.refresh(dto.refresh_token);
    return { access_token: result.accessToken, refresh_token: result.refreshToken };
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(AuthGuard('jwt'))
  async logout(@CurrentUser() user: AuthUser): Promise<void> {
    await this.auth.logout(user.jti);
  }
}
