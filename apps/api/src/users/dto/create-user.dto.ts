import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class CreateUserDto {
  // Accept any plausibly-phone-shaped input; the service normalizes it to E.164
  // (+7XXXXXXXXXX) and rejects anything that cannot be normalized.
  @IsString()
  @Length(10, 20, { message: 'phone is required' })
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
