import { IsObject, IsOptional, IsString, Length, Matches } from 'class-validator';

export class VerifyCodeDto {
  @IsString()
  @Matches(/^\+7\d{10}$/)
  phone!: string;

  @IsString()
  @Length(4, 4)
  code!: string;

  @IsOptional()
  @IsObject()
  device_info?: Record<string, unknown>;
}
