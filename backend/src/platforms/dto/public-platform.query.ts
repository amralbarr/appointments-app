import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class PublicPlatformQuery {
  @ApiPropertyOptional({ description: 'case-insensitive substring match on name' })
  @IsOptional()
  @IsString()
  search?: string;
}
