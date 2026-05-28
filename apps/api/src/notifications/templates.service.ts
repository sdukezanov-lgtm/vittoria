import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { substitute } from './notifications.vars';
import type { NotificationEvent } from './notifications.types';

export interface RenderedMessage {
  title: string;
  body: string;
}

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async render(event: NotificationEvent, vars: Record<string, string>): Promise<RenderedMessage> {
    const tpl = await this.prisma.notificationTemplate.findUnique({ where: { event } });
    if (!tpl) {
      throw new Error(`notification template not found: ${event}`);
    }
    return {
      title: substitute(tpl.title, vars),
      body: substitute(tpl.body, vars),
    };
  }
}
