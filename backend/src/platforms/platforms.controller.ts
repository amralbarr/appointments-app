import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Scopes } from '../common/decorators/scopes.decorator';
import { PlatformsService } from './platforms.service';
import { CreatePlatformDto } from './dto/create-platform.dto';
import { UpdatePlatformDto } from './dto/update-platform.dto';
import { PublicPlatformQuery } from './dto/public-platform.query';

@ApiTags('platforms')
@ApiBearerAuth()
@Controller('platforms')
export class PlatformsController {
  constructor(private readonly platforms: PlatformsService) {}

  @Scopes('platforms:write')
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePlatformDto) {
    return this.platforms.create(user.userId, dto);
  }

  @Scopes('platforms:read')
  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.platforms.listForOwner(user.userId, user.platformId);
  }

  // registered before :id so nest's route matching doesn't treat "public"
  // as an :id value.
  @Public()
  @Get('public')
  @ApiOperation({
    summary: 'List active platforms - public, no login needed',
    description: 'isActive:false platforms never appear here, same posture as any other public read.',
  })
  listPublic(@Query() query: PublicPlatformQuery) {
    return this.platforms.listPublic(query.search);
  }

  // also registered before :id, same reasoning - "public" is a literal
  // segment here, not a candidate :id value, but nest matches path
  // templates by segment count/shape so this and the single-segment
  // routes above/below don't actually collide either way.
  @Public()
  @Get('public/:slug')
  @ApiOperation({
    summary: 'Look up one active platform by slug - public, no login needed',
    description:
      '404 for both a nonexistent slug and a suspended one - same posture as listPublic, ' +
      "don't let a prober distinguish the two.",
  })
  getPublicBySlug(@Param('slug') slug: string) {
    return this.platforms.getPublicBySlug(slug);
  }

  @Scopes('platforms:read')
  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.platforms.getOwned(user.userId, id, user.platformId);
  }

  @Scopes('platforms:write')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePlatformDto,
  ) {
    return this.platforms.update(user.userId, id, dto, user.platformId);
  }
}
