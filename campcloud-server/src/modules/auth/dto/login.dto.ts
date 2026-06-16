import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  username!: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  @MaxLength(64)
  password!: string;
}
