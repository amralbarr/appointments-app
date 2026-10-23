import { Controller, Get, Param, Post, Body } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { Scopes } from '../common/decorators/scopes.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { PlatformsService } from '../platforms/platforms.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChatService } from './chat.service';
import { ChatMessageDto } from './dto/chat-message.dto';

@ApiTags('chat')
@Controller()
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly platforms: PlatformsService,
    private readonly prisma: PrismaService,
  ) {}

  // public, no account needed - same throttle tier as the booking write
  // endpoints, the real abuse surface among this controller's routes.
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('platforms/:platformId/chat')
  @ApiOperation({ summary: 'Talk to a platform\'s AI booking assistant - public, no login needed' })
  sendMessage(@Param('platformId') platformId: string, @Body() dto: ChatMessageDto) {
    return this.chat.handleMessage(platformId, dto);
  }

  // owner-scoped, same posture as every other owner-scoped read - see
  // ADR-001, this is a new call site added after that mechanism already
  // exists, so it threads callerPlatformId through too.
  @ApiBearerAuth()
  @Scopes('bookings:read')
  @Get('platforms/:platformId/chat-conversations')
  @ApiOperation({ summary: "A platform owner's view of every customer conversation their assistant has had" })
  async listConversations(
    @CurrentUser() user: AuthenticatedUser,
    @Param('platformId') platformId: string,
  ) {
    await this.platforms.getOwned(user.userId, platformId, user.platformId);
    return this.prisma.chatConversation.findMany({
      where: { platformId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  @ApiBearerAuth()
  @Scopes('bookings:read')
  @Get('platforms/:platformId/chat-conversations/:conversationId/messages')
  @ApiOperation({ summary: 'Full message history for one conversation, including tool calls + results' })
  async getMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('platformId') platformId: string,
    @Param('conversationId') conversationId: string,
  ) {
    await this.platforms.getOwned(user.userId, platformId, user.platformId);
    return this.prisma.chatMessage.findMany({
      where: { conversationId, conversation: { platformId } },
      orderBy: { createdAt: 'asc' },
    });
  }
}
