import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { OrdersService } from './orders.service';
import { OrdersMapper } from './orders.mapper';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
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
}
