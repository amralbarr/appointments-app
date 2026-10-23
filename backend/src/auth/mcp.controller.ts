import { Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { ApiKeysService } from './api-keys.service';
import { AuthService } from './auth.service';

// called by the shared mcp gateway, not by end users directly — see
// docs/MCP-INTEGRATION.md. kept out of the public swagger doc on purpose
// (ApiExcludeController) since it's not part of this api's real surface.
@ApiExcludeController()
@Controller('auth/mcp')
export class McpController {
  constructor(
    private readonly apiKeys: ApiKeysService,
    private readonly auth: AuthService,
  ) {}

  @Public()
  @Post('verify')
  async verify(
    @Headers('x-internal-secret') internalSecret: string | undefined,
    // the gateway's real apiKeyVerify contract posts { key: <raw bearer
    // token> } - see mcp-gateway's docs/CONFIG_SCHEMA.md. not "apiKey" -
    // that was a guess made before this was actually wired up and tested
    // against a real gateway instance.
    @Body('key') rawKey: string,
  ) {
    if (!internalSecret || internalSecret !== process.env.MCP_INTERNAL_SECRET) {
      throw new UnauthorizedException('Not the gateway.');
    }
    if (!rawKey) throw new UnauthorizedException('No key in request body.');

    const { userId, scopes, platformId } = await this.apiKeys.verify(rawKey);
    const accessToken = await this.auth.issueScopedAccessToken(userId, scopes, platformId);
    return { userId, scopes, accessToken };
  }
}
