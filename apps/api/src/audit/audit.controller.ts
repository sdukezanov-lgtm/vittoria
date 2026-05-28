import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { AuditService } from './audit.service';
import { ListAuditQueryDto } from './dto/list-audit.query.dto';
import type { AuditLog } from '@prisma/client';

interface AuditLogResponse {
  id: string;
  actor_user_id: string | null;
  action: string;
  entity: string;
  entity_id: string;
  before: unknown;
  after: unknown;
  created_at: string;
}

function toResponse(a: AuditLog): AuditLogResponse {
  return {
    id: a.id,
    actor_user_id: a.actorUserId,
    action: a.action,
    entity: a.entity,
    entity_id: a.entityId,
    before: a.before,
    after: a.after,
    created_at: a.createdAt.toISOString(),
  };
}

@Controller('admin/audit-log')
@Roles('admin')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  async list(
    @Query() query: ListAuditQueryDto,
  ): Promise<{ rows: AuditLogResponse[]; total: number; page: number; page_size: number }> {
    const result = await this.audit.list({
      entity: query.entity,
      actor: query.actor,
      page: query.page,
      page_size: query.page_size,
    });
    return {
      rows: result.rows.map(toResponse),
      total: result.total,
      page: result.page,
      page_size: result.page_size,
    };
  }
}
