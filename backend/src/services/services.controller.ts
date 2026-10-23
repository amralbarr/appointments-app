import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Scopes } from '../common/decorators/scopes.decorator';
import { ServicesService } from './services.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

@ApiTags('services')
@ApiBearerAuth()
@Controller('platforms/:platformId/services')
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Scopes('platforms:read')
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param('platformId') platformId: string) {
    return this.services.list(user.userId, platformId, user.platformId);
  }

  @Scopes('platforms:write')
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('platformId') platformId: string,
    @Body() dto: CreateServiceDto,
  ) {
    return this.services.create(user.userId, platformId, dto, user.platformId);
  }

  @Scopes('platforms:write')
  @Patch(':serviceId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('platformId') platformId: string,
    @Param('serviceId') serviceId: string,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.services.update(user.userId, platformId, serviceId, dto, user.platformId);
  }

  @Scopes('platforms:write')
  @Delete(':serviceId')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('platformId') platformId: string,
    @Param('serviceId') serviceId: string,
  ) {
    return this.services.remove(user.userId, platformId, serviceId, user.platformId);
  }
}
