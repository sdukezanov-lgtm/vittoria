import { IsNumber, IsUUID, Min } from 'class-validator';

export class CreateCommissionDto {
  @IsUUID()
  order_id!: string;

  @IsUUID()
  partner_user_id!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;
}
