import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class CreateMessageDto {
  @ApiProperty()
  @IsString()
  @MaxLength(5000)
  content!: string;
}
