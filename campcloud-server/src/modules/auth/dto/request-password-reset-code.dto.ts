import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';

export class RequestPasswordResetCodeDto {
  @ApiProperty()
  @IsEmail()
  @MaxLength(128)
  email!: string;
}
