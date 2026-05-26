import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RequestCodeDto } from './dto/request-code.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';

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
}
