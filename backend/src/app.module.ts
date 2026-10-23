import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { PlatformsModule } from './platforms/platforms.module';
import { ServicesModule } from './services/services.module';
import { SlotsModule } from './slots/slots.module';
import { BookingsModule } from './bookings/bookings.module';
import { RealtimeModule } from './realtime/realtime.module';
import { AdminModule } from './admin/admin.module';
import { ChatModule } from './chat/chat.module';
import { AuthGuard } from './common/guards/auth.guard';
import { ScopesGuard } from './common/guards/scopes.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // a generous global default (60/min/IP) - the public booking endpoints
    // get a much tighter override directly on the controller, since those
    // are the actual abuse surface, not every GET. skipIf keeps this out
    // of the way during tests, where the whole point of the concurrency
    // suite is firing 20 requests at once from one process.
    ThrottlerModule.forRoot({
      skipIf: () => process.env.NODE_ENV === 'test',
      errorMessage: 'Too many requests - slow down and try again shortly.',
      throttlers: [{ name: 'default', ttl: 60_000, limit: 60 }],
    }),
    PrismaModule,
    AuthModule,
    PlatformsModule,
    ServicesModule,
    SlotsModule,
    BookingsModule,
    RealtimeModule,
    AdminModule,
    ChatModule,
  ],
  providers: [
    // order matters: throttling first (reject abuse before spending any
    // effort resolving a credential), then auth resolves req.user, then
    // scopes checks it.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: ScopesGuard },
  ],
})
export class AppModule {}
