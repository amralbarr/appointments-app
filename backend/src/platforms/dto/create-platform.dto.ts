import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreatePlatformDto {
  @ApiProperty({ example: 'Dana Family Clinic' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: 'Asia/Riyadh', required: false })
  @IsOptional()
  @IsString()
  timezone?: string;
}
