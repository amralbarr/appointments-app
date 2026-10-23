import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Scopes } from '../common/decorators/scopes.decorator';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { ListBookingsQuery } from './dto/list-bookings.query';

@ApiTags('bookings')
@Controller()
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  // the three public, unauthenticated endpoints below are the real abuse
  // surface in this controller - no login needed means no account to ban
  // either, so this is the only thing standing between them and someone
  // hammering the create or guessing at cancelToken values. 10/min/ip is
  // tight enough to stop that without getting in the way of a genuine
  // customer who fat-fingers their email once or twice.
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('platforms/:platformId/slots/:slotId/bookings')
  @ApiOperation({
    summary: 'Book an open slot',
    description:
      'No account needed - this is the one write a customer makes directly. If two requests ' +
      'hit the same slot at once, exactly one gets a 201 and the other gets a 409; see ' +
      'docs/CONCURRENCY.md for why that holds under real concurrency, not just in the happy path.',
  })
  @ApiResponse({
    status: 201,
    description:
      'Booked. The response includes cancelToken - shown exactly this once, needed to cancel ' +
      'or look up this booking later. There is no login for customers, so this token is the ' +
      'only credential; losing it means the platform owner has to cancel it on your behalf.',
  })
  @ApiResponse({ status: 409, description: 'Someone else booked this slot a moment ago.' })
  create(
    @Param('platformId') platformId: string,
    @Param('slotId') slotId: string,
    @Body() dto: CreateBookingDto,
  ) {
    return this.bookings.create(platformId, slotId, dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Delete('bookings/:bookingId')
  @ApiOperation({ summary: "Cancel a booking, freeing its slot for someone else" })
  @ApiQuery({ name: 'cancelToken', required: true, description: 'from the original booking response' })
  @ApiResponse({ status: 200, description: 'Cancelled (or already was - idempotent).' })
  @ApiResponse({ status: 404, description: "No such booking, or cancelToken doesn't match it." })
  cancel(@Param('bookingId') bookingId: string, @Query('cancelToken') cancelToken: string) {
    return this.bookings.cancel(bookingId, cancelToken);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get('bookings/:bookingId')
  @ApiOperation({ summary: 'Look up a booking, using the token from the original booking response' })
  @ApiQuery({ name: 'cancelToken', required: true })
  get(@Param('bookingId') bookingId: string, @Query('cancelToken') cancelToken: string) {
    return this.bookings.getForCustomer(bookingId, cancelToken);
  }

  @ApiBearerAuth()
  @Scopes('bookings:read')
  @Get('platforms/:platformId/bookings')
  @ApiOperation({ summary: "Full booking history for a platform you own" })
  @ApiParam({ name: 'platformId' })
  listForPlatform(
    @CurrentUser() user: AuthenticatedUser,
    @Param('platformId') platformId: string,
    @Query() query: ListBookingsQuery,
  ) {
    return this.bookings.listForPlatform(user.userId, platformId, query.status, user.platformId);
  }
}
