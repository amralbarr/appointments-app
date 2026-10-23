import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateTenantDto {
  @ApiProperty({ example: 'newtenant@example.com' })
  @IsEmail()
  ownerEmail: string;

  @ApiProperty({ example: 'Taylor', required: false })
  @IsOptional()
  @IsString()
  ownerName?: string;

  @ApiProperty({ example: "Taylor's Dental Clinic" })
  @IsString()
  @MinLength(2)
  platformName: string;

  @ApiProperty({ example: 'Asia/Riyadh', required: false })
  @IsOptional()
  @IsString()
  timezone?: string;
}
