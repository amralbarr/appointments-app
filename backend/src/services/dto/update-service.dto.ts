import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class UpdateServiceDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  nameAr?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(5)
  durationMinutes?: number;
}
