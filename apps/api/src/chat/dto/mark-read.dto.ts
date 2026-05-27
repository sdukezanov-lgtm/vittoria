import { IsUUID } from 'class-validator';

export class MarkReadDto {
  @IsUUID()
  up_to_message_id!: string;
}
