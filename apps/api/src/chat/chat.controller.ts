import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { ChatService } from './chat.service';
import { ChatMapper, MessageResponse } from './chat.mapper';
import { SendMessageDto } from './dto/send-message.dto';
import { MarkReadDto } from './dto/mark-read.dto';
import { ListMessagesQueryDto } from './dto/list-messages.query.dto';

@Controller()
@Roles('client', 'admin')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly mapper: ChatMapper,
  ) {}

  @Get('orders/:id/chat')
  async findOrCreate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) orderId: string,
  ): Promise<{ id: string; order_id: string; created_at: string; unread_count: number }> {
    const chat = await this.chat.findOrCreateForOrder(orderId, user);
    return {
      id: chat.id,
      order_id: chat.order_id,
      created_at: chat.created_at.toISOString(),
      unread_count: chat.unread_count,
    };
  }

  @Get('chats/:id/messages')
  async listMessages(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) chatId: string,
    @Query() query: ListMessagesQueryDto,
  ): Promise<{ rows: MessageResponse[] }> {
    const msgs = await this.chat.listMessages(chatId, user, {
      before: query.before,
      limit: query.limit,
    });
    return { rows: msgs.map((m) => this.mapper.toMessageResponse(m)) };
  }

  @Post('chats/:id/messages')
  async sendMessage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) chatId: string,
    @Body() dto: SendMessageDto,
  ): Promise<MessageResponse> {
    const msg = await this.chat.sendMessage(chatId, user, { text: dto.text });
    return this.mapper.toMessageResponse(msg);
  }

  @Patch('chats/:id/read')
  @HttpCode(200)
  async markRead(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) chatId: string,
    @Body() dto: MarkReadDto,
  ): Promise<{ updated: number }> {
    return this.chat.markRead(chatId, user, dto.up_to_message_id);
  }
}
