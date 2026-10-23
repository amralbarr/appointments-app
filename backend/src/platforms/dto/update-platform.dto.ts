import { ApiProperty } from '@nestjs/swagger';
import { WeekDay } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class UpdatePlatformDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  timezone?: string;

  // the six public-profile fields - not isActive, that's admin-only (M5),
  // never settable through this owner-facing route.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  coverImageUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  businessHoursText?: string;

  // Arabic counterparts of the three translatable content fields above -
  // same optional-string shape, no format validation beyond that (free text).
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  nameAr?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  descriptionAr?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  businessHoursTextAr?: string;

  // structured working-hours data - see schema.prisma's comment on
  // Platform.workingDays for why this is a real enum array rather than
  // free-text days. whole array is replaced on every PATCH, same
  // replace-not-merge semantics Prisma's scalar-list columns always have.
  @ApiProperty({ required: false, enum: WeekDay, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(WeekDay, { each: true })
  workingDays?: WeekDay[];

  // "HH:mm" 24-hour, same plain-string convention as businessHoursText -
  // validated here (not just documented) since an unvalidated free-text
  // time is exactly the kind of value a slot-availability UI would need
  // to re-parse defensively forever otherwise.
  @ApiProperty({ required: false, example: '09:00' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'openTime must be in HH:mm 24-hour format.' })
  openTime?: string;

  @ApiProperty({ required: false, example: '17:00' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'closeTime must be in HH:mm 24-hour format.' })
  closeTime?: string;

  // off by default (schema's own @default(false)) - a tenant opts in
  // themselves. Gates customer-initiated cancellation only (the chat and
  // the standalone manage-booking page) - see BookingsService.cancel()'s
  // own comment for why this is the one real enforcement point.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  customerCancellationEnabled?: boolean;

  // default 1 (schema's own @default(1)) - how many customers can hold
  // the same time+service simultaneously (a barbershop with several
  // chairs, a salon with multiple stylists). Capped at 20: a real
  // ceiling against a fat-fingered or abusive value blowing up
  // SlotsService.ensureFutureSlots' own row generation (seats x every
  // slot in a 60-day rolling window, per service).
  @ApiProperty({ required: false, minimum: 1, maximum: 20, example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  seats?: number;
}
