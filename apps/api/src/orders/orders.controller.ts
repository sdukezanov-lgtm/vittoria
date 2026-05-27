import { Controller, Get, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { OrdersService } from './orders.service';
import { OrdersMapper } from './orders.mapper';
import type { OrderResponse } from './dto/order.dto';

@Controller('orders')
@Roles('client')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly mapper: OrdersMapper,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser): Promise<{ items: OrderResponse[] }> {
    const rows = await this.orders.listForClient(user.id);
    return { items: rows.map((r) => this.mapper.toResponse(r)) };
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderResponse> {
    const order = await this.orders.findByIdForClient(id, user.id);
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    return this.mapper.toResponse(order);
  }
}
