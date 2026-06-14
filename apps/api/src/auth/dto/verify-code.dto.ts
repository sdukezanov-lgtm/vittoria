import { IsObject, IsOptional, IsString, Length } from 'class-validator';

export class VerifyCodeDto {
  @IsString()
  @Length(10, 20, { message: 'phone is required' })
  phone!: string;

  @IsString()
  @Length(4, 4)
  code!: string;

  @IsOptional()
  @IsObject()
  device_info?: Record<string, unknown>;
}
