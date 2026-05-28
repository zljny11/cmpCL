import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateUploadSessionDto {
  @ApiProperty({ description: '文件名' })
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @ApiProperty({ description: '相对路径，用于同目录恢复上传' })
  @IsString()
  @MaxLength(500)
  relativePath!: string;

  @ApiProperty({ description: '文件大小（字节）' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  fileSize!: number;

  @ApiPropertyOptional({ description: '文件 MIME 类型' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  mimeType?: string;

  @ApiPropertyOptional({ description: '文件最后修改时间戳（毫秒）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lastModified?: number;
}
