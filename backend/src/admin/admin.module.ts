import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminPlatformsService } from './admin-platforms.service';
import { PlatformsModule } from '../platforms/platforms.module';

@Module({
  imports: [PlatformsModule],
  controllers: [AdminController],
  providers: [AdminPlatformsService],
})
export class AdminModule {}
