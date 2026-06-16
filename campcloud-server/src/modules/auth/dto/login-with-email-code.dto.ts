import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginWithEmailCodeDto {
  @ApiProperty()
  @IsEmail()
  @MaxLength(128)
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(4)
  @MaxLength(8)
  code!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(64)
  newPassword?: string;
}
