import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class CreateBookingDto {
  @ApiProperty({ example: 'Sara Ahmed' })
  @IsString()
  @MinLength(2)
  customerName: string;

  @ApiProperty({ example: 'sara@example.com' })
  @IsEmail()
  customerEmail: string;
}
