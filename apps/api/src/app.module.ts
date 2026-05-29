import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { QueuesModule } from './queues/queues.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AmocrmModule } from './amocrm/amocrm.module';
import { OrdersModule } from './orders/orders.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ChatModule } from './chat/chat.module';
import { CommissionsModule } from './commissions/commissions.module';
import { UsersModule } from './users/users.module';
import { HealthModule } from './health/health.module';
import { ServiceModule } from './service/service.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    QueuesModule,
    AuditModule,
    AuthModule,
    AmocrmModule,
    OrdersModule,
    NotificationsModule,
    ChatModule,
    CommissionsModule,
    UsersModule,
    HealthModule,
    ServiceModule,
    ThrottlerModule.forRoot([{ name: 'global', ttl: 60_000, limit: 60 }]),
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
