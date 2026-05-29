import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Roles } from '../common/decorators/roles.decorator';
import type { Env } from '../config/env.schema';

@Controller('service')
@Roles('client', 'admin', 'partner')
export class ServiceController {
  constructor(private readonly config: ConfigService<Env, true>) {}

  @Get('contact')
  contact(): { phone: string; hours: string } {
    return {
      phone: this.config.get('SERVICE_CONTACT_PHONE', { infer: true }),
      hours: this.config.get('SERVICE_CONTACT_HOURS', { infer: true }),
    };
  }
}
