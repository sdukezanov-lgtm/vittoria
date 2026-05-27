import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStage } from '@prisma/client';

export class UpdateProgressDto {
  @IsOptional()
  @IsEnum(OrderStage)
  stage?: OrderStage;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  progress_percent?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
