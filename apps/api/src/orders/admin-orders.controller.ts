import { Body, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { OrdersService } from './orders.service';
import { OrdersMapper } from './orders.mapper';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { UpdateProgressDto } from './dto/update-progress.dto';
import type { OrderResponse } from './dto/order.dto';

interface AdminListResponse {
  items: OrderResponse[];
  page: number;
  page_size: number;
  total: number;
}

@Controller('admin/orders')
@Roles('admin')
export class AdminOrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly mapper: OrdersMapper,
  ) {}

  @Get()
  async list(@Query() query: ListOrdersQueryDto): Promise<AdminListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const { rows, total } = await this.orders.listAll({
      search: query.search,
      stage: query.stage,
      page,
      pageSize,
    });
    return {
      items: rows.map((r) => this.mapper.toResponse(r)),
      page,
      page_size: pageSize,
      total,
    };
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<OrderResponse> {
    const order = await this.orders.findById(id);
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    return this.mapper.toResponse(order);
  }

  @Patch(':id/progress')
  @HttpCode(200)
  async updateProgress(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProgressDto,
  ): Promise<OrderResponse> {
    const order = await this.orders.findById(id);
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });

    await this.orders.updateProgress(id, {
      stage: dto.stage,
      progressPercent: dto.progress_percent,
      comment: dto.comment,
      actorUserId: user.id,
    });

    const updated = await this.orders.findById(id);
    return this.mapper.toResponse(updated!);
  }
}
