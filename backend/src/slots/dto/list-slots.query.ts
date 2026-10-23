import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsISO8601, IsOptional, IsUUID } from 'class-validator';

export class ListSlotsQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @ApiPropertyOptional({ description: 'ISO date, inclusive lower bound on startsAt' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date, exclusive upper bound on startsAt' })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({ default: true, description: 'only slots with no confirmed booking' })
  @IsOptional()
  @Transform(({ value }) => value === 'false' ? false : value === 'true' ? true : value)
  @IsBoolean()
  onlyOpen?: boolean = true;

  @ApiPropertyOptional({
    default: false,
    description:
      'collapse multiple seats sharing the same (startsAt, serviceId) into one representative ' +
      'row - a customer picking "10:00 Haircut" should see one option, not one per chair. ' +
      'Owner-facing slot management never sets this - it needs to see/manage every real seat row.',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'false' ? false : value === 'true' ? true : value)
  @IsBoolean()
  dedupe?: boolean = false;
}
