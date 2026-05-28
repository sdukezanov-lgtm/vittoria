import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { CommissionsService } from './commissions.service';
import { CommissionsMapper, CommissionResponse } from './commissions.mapper';
import { PartnerCommissionsQueryDto } from './dto/list-commissions.query.dto';

@Controller('partner/commissions')
@Roles('partner')
export class PartnerCommissionsController {
  constructor(
    private readonly commissions: CommissionsService,
    private readonly mapper: CommissionsMapper,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: PartnerCommissionsQueryDto,
  ): Promise<{ rows: CommissionResponse[] }> {
    const rows = await this.commissions.listForPartner(user.id, {
      payout_status: query.payout_status,
    });
    return { rows: rows.map((c) => this.mapper.toResponse(c)) };
  }
}
