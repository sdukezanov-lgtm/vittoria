import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { CommissionsService } from './commissions.service';
import { CommissionsMapper, CommissionResponse } from './commissions.mapper';
import { CreateCommissionDto } from './dto/create-commission.dto';
import { UpdateCommissionDto } from './dto/update-commission.dto';
import { ListCommissionsQueryDto } from './dto/list-commissions.query.dto';

@Controller('admin/commissions')
@Roles('admin')
export class AdminCommissionsController {
  constructor(
    private readonly commissions: CommissionsService,
    private readonly mapper: CommissionsMapper,
  ) {}

  @Post()
  async create(@Body() dto: CreateCommissionDto): Promise<CommissionResponse> {
    const c = await this.commissions.create(dto);
    return this.mapper.toResponse(c);
  }

  @Patch(':id')
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCommissionDto,
  ): Promise<CommissionResponse> {
    const c = await this.commissions.updateStatus(id, dto.payout_status);
    return this.mapper.toResponse(c);
  }

  @Get()
  async list(
    @Query() query: ListCommissionsQueryDto,
  ): Promise<{ rows: CommissionResponse[]; total: number; page: number; page_size: number }> {
    const result = await this.commissions.listAdmin({
      partner_user_id: query.partner_user_id,
      payout_status: query.payout_status,
      page: query.page,
      page_size: query.page_size,
    });
    return {
      rows: result.rows.map((c) => this.mapper.toResponse(c)),
      total: result.total,
      page: result.page,
      page_size: result.page_size,
    };
  }
}
