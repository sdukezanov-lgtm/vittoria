import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { PayoutStatus } from '@prisma/client';

export class ListCommissionsQueryDto {
  @IsOptional()
  @IsUUID()
  partner_user_id?: string;

  @IsOptional()
  @IsEnum(PayoutStatus)
  payout_status?: PayoutStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page_size?: number;
}

export class PartnerCommissionsQueryDto {
  @IsOptional()
  @IsEnum(PayoutStatus)
  payout_status?: PayoutStatus;
}
