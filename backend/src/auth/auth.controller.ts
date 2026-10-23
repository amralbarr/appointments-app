import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { ApiKeysService } from './api-keys.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

const REFRESH_COOKIE = 'refresh_token';
const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/api/v1/auth',
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly apiKeys: ApiKeysService,
  ) {}

  @Public()
  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken } = await this.auth.register(dto);
    res.cookie(REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTS);
    return { accessToken };
  }

  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken } = await this.auth.login(dto);
    res.cookie(REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTS);
    return { accessToken };
  }

  @Public()
  @Post('refresh')
  async refresh(@Res({ passthrough: true }) res: Response, @Body('refreshToken') bodyToken?: string) {
    // the cookie is the real path for a browser; a bare body field is there
    // for anything that isn't carrying cookies (scripts, tests)
    const cookieToken = (res.req as any).cookies?.[REFRESH_COOKIE];
    const refreshToken = cookieToken ?? bodyToken;
    if (!refreshToken) throw new UnauthorizedException('No refresh token provided.');

    const { userId } = await this.auth.verifyRefreshToken(refreshToken);
    const pair = await this.auth.refresh(userId, refreshToken);
    res.cookie(REFRESH_COOKIE, pair.refreshToken, REFRESH_COOKIE_OPTS);
    return { accessToken: pair.accessToken };
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentUser() user: AuthenticatedUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user.userId);
    res.clearCookie(REFRESH_COOKIE, REFRESH_COOKIE_OPTS);
  }

  @ApiBearerAuth()
  @Get('api-keys')
  listApiKeys(@CurrentUser() user: AuthenticatedUser) {
    return this.apiKeys.listForUser(user.userId);
  }

  @ApiBearerAuth()
  @Post('api-keys')
  createApiKey(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateApiKeyDto) {
    return this.apiKeys.create(user.userId, dto);
  }

  @ApiBearerAuth()
  @Delete('api-keys/:id')
  @HttpCode(204)
  revokeApiKey(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.apiKeys.revoke(user.userId, id);
  }
}
