import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Scopes } from '../common/decorators/scopes.decorator';
import { SlotsService } from './slots.service';
import { CreateSlotDto } from './dto/create-slot.dto';
import { ListSlotsQuery } from './dto/list-slots.query';

@ApiTags('slots')
@Controller('platforms/:platformId/slots')
export class SlotsController {
  constructor(private readonly slots: SlotsService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'List slots - public, no login needed',
    description: 'onlyOpen (default true) filters to slots with no confirmed booking, computed live.',
  })
  list(@Param('platformId') platformId: string, @Query() query: ListSlotsQuery) {
    return this.slots.list(platformId, query);
  }

  @Public()
  @Get(':slotId')
  get(@Param('platformId') platformId: string, @Param('slotId') slotId: string) {
    return this.slots.getPublic(platformId, slotId);
  }

  @ApiBearerAuth()
  @Scopes('platforms:write')
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('platformId') platformId: string,
    @Body() dto: CreateSlotDto,
  ) {
    return this.slots.create(user.userId, platformId, dto, user.platformId);
  }

  @ApiBearerAuth()
  @Scopes('platforms:write')
  @Delete(':slotId')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('platformId') platformId: string,
    @Param('slotId') slotId: string,
  ) {
    return this.slots.remove(user.userId, platformId, slotId, user.platformId);
  }
}
