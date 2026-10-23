import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ToolExecutor } from './tool-executor';
import { PlatformsModule } from '../platforms/platforms.module';
import { ServicesModule } from '../services/services.module';
import { SlotsModule } from '../slots/slots.module';
import { BookingsModule } from '../bookings/bookings.module';

@Module({
  imports: [PlatformsModule, ServicesModule, SlotsModule, BookingsModule],
  controllers: [ChatController],
  providers: [ChatService, ToolExecutor],
})
export class ChatModule {}
