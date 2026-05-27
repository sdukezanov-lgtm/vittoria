import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { PushPlatform } from '@prisma/client';

export class RegisterPushTokenDto {
  @IsEnum(PushPlatform)
  platform!: PushPlatform;

  @IsString()
  @MinLength(8)
  @MaxLength(4096)
  token!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  device_id!: string;
}
