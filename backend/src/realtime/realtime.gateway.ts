import {
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

// read-only room membership, no credential required to join — a listener
// never learns anything a plain GET /platforms/:id/slots wouldn't already
// tell them. see docs/REALTIME.md.
@WebSocketGateway({ namespace: '/realtime', cors: { origin: '*' } })
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  handleConnection() {
    // nothing to do on connect alone — a client still has to send 'join'
  }

  @SubscribeMessage('join')
  handleJoin(client: Socket, payload: { platformId: string }) {
    client.join(`platform:${payload.platformId}`);
  }

  emitSlotBooked(platformId: string, slotId: string) {
    this.server
      .to(`platform:${platformId}`)
      .emit('slot.booked', { slotId, platformId, bookedAt: new Date().toISOString() });
  }

  emitSlotCancelled(platformId: string, slotId: string) {
    this.server
      .to(`platform:${platformId}`)
      .emit('slot.cancelled', { slotId, platformId, cancelledAt: new Date().toISOString() });
  }
}
