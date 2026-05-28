import { IsEnum } from 'class-validator';
import { PayoutStatus } from '@prisma/client';

export class UpdateCommissionDto {
  @IsEnum(PayoutStatus)
  payout_status!: PayoutStatus;
}
