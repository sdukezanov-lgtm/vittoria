import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @Matches(/^\+7\d{10}$/, { message: 'phone must be +7XXXXXXXXXX' })
  phone!: string;

  @IsIn(['admin', 'partner'])
  role!: 'admin' | 'partner';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  first_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  last_name?: string;
}
