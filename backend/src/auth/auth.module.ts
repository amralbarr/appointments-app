import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { McpController } from './mcp.controller';
import { AuthService } from './auth.service';
import { ApiKeysService } from './api-keys.service';

@Module({
  imports: [JwtModule.register({})], // secrets passed per-call, see auth.service.ts
  controllers: [AuthController, McpController],
  providers: [AuthService, ApiKeysService],
  exports: [AuthService, ApiKeysService, JwtModule],
})
export class AuthModule {}
