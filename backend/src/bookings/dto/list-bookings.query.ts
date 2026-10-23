import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class ListBookingsQuery {
  @ApiPropertyOptional({ enum: ['CONFIRMED', 'CANCELLED'] })
  @IsOptional()
  @IsIn(['CONFIRMED', 'CANCELLED'])
  status?: 'CONFIRMED' | 'CANCELLED';
}
