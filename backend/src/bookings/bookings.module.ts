import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { PlatformsModule } from '../platforms/platforms.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [PlatformsModule, RealtimeModule],
  controllers: [BookingsController],
  providers: [BookingsService],
  // ChatModule (M6) calls this in-process, the exact same method the
  // REST controller already calls - no export needed before now since
  // nothing else imported this module.
  exports: [BookingsService],
})
export class BookingsModule {}
