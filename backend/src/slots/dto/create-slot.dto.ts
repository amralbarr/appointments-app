import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsUUID } from 'class-validator';

export class CreateSlotDto {
  @ApiProperty({ example: 'a1b2c3d4-...' })
  @IsUUID()
  serviceId: string;

  @ApiProperty({ example: '2026-01-05T09:00:00.000Z' })
  @IsISO8601()
  startsAt: string;

  @ApiProperty({ example: '2026-01-05T09:30:00.000Z' })
  @IsISO8601()
  endsAt: string;
}
