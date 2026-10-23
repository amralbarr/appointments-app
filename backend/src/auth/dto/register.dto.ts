import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'owner@myclinic.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'correct-horse-battery-staple', minLength: 8 })
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'Dana', required: false })
  @IsOptional()
  name?: string;
}
