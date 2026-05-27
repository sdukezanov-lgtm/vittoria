import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { ChatService, AdminChatListResult } from './chat.service';
import { ListAdminChatsQueryDto } from './dto/list-admin-chats.query.dto';

@Controller('admin/chats')
@Roles('admin')
export class AdminChatsController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  async list(@Query() query: ListAdminChatsQueryDto): Promise<AdminChatListResult> {
    return this.chat.listAdminChats({
      has_unread: query.has_unread,
      page: query.page,
      page_size: query.page_size,
    });
  }
}
