import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformsService } from '../platforms/platforms.service';
import { CreateTenantDto } from './dto/create-tenant.dto';

const SALT_ROUNDS = 10;

@Injectable()
export class AdminPlatformsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platforms: PlatformsService,
  ) {}

  // the one place "every platform regardless of owner" is the correct
  // query - every other platform read in this codebase filters by
  // ownerId, deliberately, this is the exception.
  listAll() {
    return this.prisma.platform.findMany({ orderBy: { createdAt: 'asc' } });
  }

  // ADR-002: a brand-new owner gets a random initial password, returned
  // in plaintext exactly once, right here - never persisted anywhere in
  // plaintext, never logged. an existing owner gets no password back at
  // all (nothing new to disclose, they already have one).
  async createForOwner(dto: CreateTenantDto) {
    let owner = await this.prisma.user.findUnique({ where: { email: dto.ownerEmail } });
    let initialPassword: string | undefined;

    if (!owner) {
      initialPassword = randomBytes(12).toString('base64url');
      const passwordHash = await bcrypt.hash(initialPassword, SALT_ROUNDS);
      owner = await this.prisma.user.create({
        data: { email: dto.ownerEmail, name: dto.ownerName, passwordHash },
      });
    }

    const slug = await this.platforms.uniqueSlug(dto.platformName);
    const platform = await this.prisma.platform.create({
      data: {
        ownerId: owner.id,
        name: dto.platformName,
        slug,
        timezone: dto.timezone ?? 'UTC',
      },
    });

    return { platform, owner: { id: owner.id, email: owner.email }, initialPassword };
  }

  // no ownership check at all - an admin can act on any platform by
  // design, unlike every owner-scoped write in this codebase.
  setStatus(platformId: string, isActive: boolean) {
    return this.prisma.platform.update({ where: { id: platformId }, data: { isActive } });
  }

  // real, irreversible deletion - a deliberate addition on top of this
  // module's original "suspend is the only removal mechanism, never a
  // delete" posture (see setStatus's own comment above, and
  // ROLES-AND-DASHBOARDS.md). Suspending still exists for "hide without
  // losing data"; this is for the other real case - a test/throwaway
  // tenant, or a genuinely departed one - where the data really should
  // go away. No ownership check, same as setStatus. The owning User row
  // is deliberately left alone: an owner can have more than one
  // platform, and deleting a tenant should never silently delete
  // someone's login account.
  async remove(platformId: string) {
    const platform = await this.prisma.platform.findUnique({ where: { id: platformId } });
    if (!platform) throw new NotFoundException('No such platform.');

    await this.prisma.$transaction([
      this.prisma.chatMessage.deleteMany({
        where: { conversation: { platformId } },
      }),
      this.prisma.chatConversation.deleteMany({ where: { platformId } }),
      this.prisma.booking.deleteMany({ where: { platformId } }),
      this.prisma.slot.deleteMany({ where: { platformId } }),
      this.prisma.service.deleteMany({ where: { platformId } }),
      this.prisma.apiKey.deleteMany({ where: { platformId } }),
      this.prisma.platform.delete({ where: { id: platformId } }),
    ]);

    return { deleted: true, id: platformId, name: platform.name, slug: platform.slug };
  }
}
