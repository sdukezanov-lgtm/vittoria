import { IsString, Length } from 'class-validator';

export class RequestCodeDto {
  // Accept any plausibly-phone-shaped input; the service normalizes it to E.164
  // (+7XXXXXXXXXX) and rejects anything that cannot be normalized.
  @IsString()
  @Length(10, 20, { message: 'phone is required' })
  phone!: string;
}
