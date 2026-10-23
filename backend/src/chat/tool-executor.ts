import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ServicesService } from '../services/services.service';
import { SlotsService } from '../slots/slots.service';
import { BookingsService } from '../bookings/bookings.service';

// tool name -> real service call, the exact same methods the REST
// controllers already call, no HTTP round-trip, no api key. see
// AI-BOOKING-ASSISTANT.md's "Why in-process, not the gateway".
@Injectable()
export class ToolExecutor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly services: ServicesService,
    private readonly slots: SlotsService,
    private readonly bookings: BookingsService,
  ) {}

  // platformId always comes from the chat request's own URL - never from
  // whatever value the model's tool_use input happens to carry for it,
  // even though the yaml schema (and therefore the tool definition
  // handed to Claude) declares one for fidelity to the real MCP tool
  // shape. a model-controlled value must never cross the tenant boundary.
  // sessionCustomerEmail is that same posture applied to create_booking's
  // customerEmail - see createBooking() below.
  // return type deliberately loose - a dynamic name->method dispatcher
  // whose actual shape varies per tool, consumed by ChatService as an
  // opaque tool_result payload (JSON.stringify'd), not destructured.
  async execute(
    toolName: string,
    platformId: string,
    input: Record<string, unknown>,
    sessionCustomerEmail: string,
  ): Promise<any> {
    switch (toolName) {
      case 'list_services':
        return this.listServices(platformId);
      case 'list_slots':
        return this.listSlots(platformId, input);
      case 'create_booking':
        return this.createBooking(platformId, input, sessionCustomerEmail);
      case 'cancel_booking':
        return this.cancelBooking(input);
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  private async listServices(platformId: string) {
    // this in-process caller is the platform's own system acting on its
    // own data, not a delegated external credential - resolving and
    // using the real ownerId directly is correct here, not a bypass.
    const platform = await this.prisma.platform.findUniqueOrThrow({
      where: { id: platformId },
      select: { ownerId: true },
    });
    return this.services.list(platform.ownerId, platformId);
  }

  private listSlots(platformId: string, input: Record<string, unknown>) {
    return this.slots.list(platformId, {
      serviceId: input.serviceId as string | undefined,
      from: input.from as string | undefined,
      to: input.to as string | undefined,
      onlyOpen: input.onlyOpen as boolean | undefined,
      // always - a customer-facing conversation should never see one
      // entry per seat for the same time+service (a multi-chair
      // barbershop would otherwise read as 3x the real number of open
      // times, or confuse the model into thinking there are 3 different
      // slots to pick between).
      dedupe: true,
    });
  }

  private createBooking(platformId: string, input: Record<string, unknown>, sessionCustomerEmail: string) {
    // customerEmail always comes from this chat session's own opening
    // identity (the dto that started the conversation), never from
    // whatever the model's tool_use input claims - the model fills that
    // field from conversation text, which a customer fully controls.
    // without this override, typing "book it under victim@example.com"
    // would create a real confirmed booking under someone else's name.
    return this.bookings.create(platformId, input.slotId as string, {
      customerName: input.customerName as string,
      customerEmail: sessionCustomerEmail,
    });
  }

  private async cancelBooking(input: Record<string, unknown>) {
    const cancelToken = input.cancelToken as string | undefined;
    // the prompt already tells the model to ask the customer for a real
    // cancelToken rather than guess - but a smaller model doesn't always
    // obey that reliably (observed for real: it called this tool anyway
    // with the customer having never given one), so this is a real code
    // guard, not just prose. a clear, distinct error message here - not
    // the same generic "No such booking" a real wrong-token attempt
    // gets - is what actually steers the model's next reply toward
    // asking the customer, rather than repeating a dead-end attempt.
    if (!cancelToken || !cancelToken.trim()) {
      throw new Error(
        'No cancelToken was given. Do not call this tool again until the customer has actually ' +
          'provided one in their own message - ask them for it instead.',
      );
    }

    // the model is never given a real bookingId to pass along here - the
    // customer only ever has the cancelToken (see
    // BookingsService.findIdByCancelToken's own comment) - so this always
    // resolves by token alone, even though the shared yaml schema still
    // declares bookingId as an optional field for fidelity to the owner-
    // facing gateway tool shape.
    const bookingId = await this.bookings.findIdByCancelToken(cancelToken);
    return this.bookings.cancel(bookingId, cancelToken);
  }
}
