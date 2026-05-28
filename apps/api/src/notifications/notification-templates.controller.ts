import { Body, Controller, Get, NotFoundException, Param, Patch } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { CHANNEL_MATRIX } from './notifications.types';
import type { NotificationTemplate } from '@prisma/client';

interface TemplateResponse {
  event: string;
  title: string;
  body: string;
  updated_at: string;
}

function toResponse(t: NotificationTemplate): TemplateResponse {
  return {
    event: t.event,
    title: t.title,
    body: t.body,
    updated_at: t.updatedAt.toISOString(),
  };
}

@Controller('admin/notification-templates')
@Roles('admin')
export class NotificationTemplatesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(): Promise<{ rows: TemplateResponse[] }> {
    const rows = await this.prisma.notificationTemplate.findMany({ orderBy: { event: 'asc' } });
    return { rows: rows.map(toResponse) };
  }

  @Patch(':event')
  async update(
    @Param('event') event: string,
    @Body() dto: UpdateTemplateDto,
  ): Promise<TemplateResponse> {
    if (!(event in CHANNEL_MATRIX)) {
      throw new NotFoundException({ code: 'TEMPLATE_NOT_FOUND', message: 'Unknown event' });
    }
    const existing = await this.prisma.notificationTemplate.findUnique({ where: { event } });
    if (!existing) {
      throw new NotFoundException({ code: 'TEMPLATE_NOT_FOUND', message: 'Template not found' });
    }
    const updated = await this.prisma.notificationTemplate.update({
      where: { event },
      data: {
        title: dto.title ?? existing.title,
        body: dto.body ?? existing.body,
      },
    });
    return toResponse(updated);
  }
}
