import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { ChatService } from './chat.service';
import { ChatMapper, MessageResponse } from './chat.mapper';
import { SendMessageDto } from './dto/send-message.dto';
import { MarkReadDto } from './dto/mark-read.dto';
import { ListMessagesQueryDto } from './dto/list-messages.query.dto';
import { sniffMime } from '../storage/mime-sniff';

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
    return { rows: await Promise.all(msgs.map((m) => this.mapper.toMessageResponse(m))) };
  }

  @Post('chats/:id/messages')
  async sendMessage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) chatId: string,
    @Body() dto: SendMessageDto,
  ): Promise<MessageResponse> {
    const msg = await this.chat.sendMessage(chatId, user, { text: dto.text, attachmentIds: dto.attachment_ids });
    return await this.mapper.toMessageResponse(msg);
  }

  @Post('chats/:id/attachments')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAttachment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) chatId: string,
    @UploadedFile() file: { buffer: Buffer; size: number } | undefined,
  ): Promise<{ attachment_id: string; object_key: string }> {
    if (!file) throw new BadRequestException({ code: 'FILE_REQUIRED', message: 'file is required' });
    const mime = sniffMime(file.buffer);
    if (!mime) throw new BadRequestException({ code: 'UNSUPPORTED_TYPE', message: 'unsupported file type' });
    return this.chat.createAttachment(chatId, user, { buffer: file.buffer, size: file.size, mime });
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
