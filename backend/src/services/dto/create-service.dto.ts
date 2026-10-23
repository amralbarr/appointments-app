import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateServiceDto {
  @ApiProperty({ example: 'General consultation' })
  @IsString()
  @MinLength(2)
  name: string;

  // Arabic counterpart of name - optional, same paired-nullable-column
  // convention as Platform's *Ar fields.
  @ApiProperty({ example: 'كشف عام', required: false })
  @IsOptional()
  @IsString()
  nameAr?: string;

  @ApiProperty({ example: 30 })
  @IsInt()
  @Min(5)
  durationMinutes: number;
}
