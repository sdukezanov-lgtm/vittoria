import { IsString, Matches } from 'class-validator';

export class RequestCodeDto {
  @IsString()
  @Matches(/^\+7\d{10}$/, { message: 'phone must be in E.164 format +7XXXXXXXXXX' })
  phone!: string;
}
