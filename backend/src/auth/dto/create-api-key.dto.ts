import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';

export const AVAILABLE_SCOPES = [
  'platforms:read',
  'platforms:write',
  'bookings:read',
  'bookings:write',
] as const;

export class CreateApiKeyDto {
  @ApiProperty({ example: 'my booking assistant', required: false })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiProperty({
    example: ['platforms:read', 'bookings:read', 'bookings:write'],
    enum: AVAILABLE_SCOPES,
    isArray: true,
  })
  @IsArray()
  @IsIn(AVAILABLE_SCOPES, { each: true })
  scopes: string[];
}
