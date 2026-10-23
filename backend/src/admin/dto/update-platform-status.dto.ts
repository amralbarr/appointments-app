import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdatePlatformStatusDto {
  @ApiProperty({ example: false, description: 'suspend (false) or reactivate (true) this platform' })
  @IsBoolean()
  isActive: boolean;
}
