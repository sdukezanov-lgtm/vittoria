import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatMapper } from './chat.mapper';
import { ChatController } from './chat.controller';
import { AdminChatsController } from './admin-chats.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [ChatController, AdminChatsController],
  providers: [ChatService, ChatMapper],
  exports: [ChatService],
})
export class ChatModule {}
