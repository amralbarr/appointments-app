import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../common/guards/admin.guard';
import { AdminPlatformsService } from './admin-platforms.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdatePlatformStatusDto } from './dto/update-platform-status.dto';

// deliberately separate from PlatformsController, not an if (isAdmin)
// branch sprinkled into code that's currently simple specifically
// because it never has to ask that question - see
// ROLES-AND-DASHBOARDS.md. every route here needs AdminGuard ON TOP OF
// the existing global AuthGuard/ScopesGuard chain - an owner's own JWT,
// or ANY api key (even one belonging to an ADMIN-role user), gets 403
// here.
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminPlatforms: AdminPlatformsService) {}

  @Get('platforms')
  @ApiOperation({ summary: 'Every platform regardless of owner, including suspended ones - admin only' })
  listAll() {
    return this.adminPlatforms.listAll();
  }

  @Post('platforms')
  @ApiOperation({ summary: 'Create a tenant (user + platform) on someone else\'s behalf' })
  @ApiResponse({
    status: 201,
    description:
      'Created. If ownerEmail did not already have an account, the response includes ' +
      'initialPassword - shown exactly this once, never retrievable again. Relay it to the ' +
      'tenant out-of-band (ADR-002); there is no automated email delivery.',
  })
  createTenant(@Body() dto: CreateTenantDto) {
    return this.adminPlatforms.createForOwner(dto);
  }

  @Patch('platforms/:id/status')
  @ApiOperation({ summary: 'Suspend or reactivate any platform - a flag flip, never a delete' })
  setStatus(@Param('id') id: string, @Body() dto: UpdatePlatformStatusDto) {
    return this.adminPlatforms.setStatus(id, dto.isActive);
  }

  @Delete('platforms/:id')
  @ApiOperation({
    summary:
      'Permanently delete a platform and everything under it (services, slots, bookings, ' +
      'chat history, api keys) - irreversible, unlike status. The owning user account is not deleted.',
  })
  remove(@Param('id') id: string) {
    return this.adminPlatforms.remove(id);
  }
}
