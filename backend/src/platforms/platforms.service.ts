import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { slugify } from '../common/slugify';
import { CreatePlatformDto } from './dto/create-platform.dto';
import { UpdatePlatformDto } from './dto/update-platform.dto';

@Injectable()
export class PlatformsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ownerId: string, dto: CreatePlatformDto) {
    const slug = await this.uniqueSlug(dto.name);
    return this.prisma.platform.create({
      data: { ownerId, name: dto.name, slug, timezone: dto.timezone ?? 'UTC' },
    });
  }

  // public, unauthenticated discovery - isActive:true only (a suspended
  // platform is invisible here, not a special-cased error, see
  // ROLES-AND-DASHBOARDS.md), and a select restricted to public fields
  // only - no ownerId anywhere in this response shape. every profile
  // field is returned here, not just the four /list currently needs.
  listPublic(search?: string) {
    return this.prisma.platform.findMany({
      where: {
        isActive: true,
        ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
      },
      select: {
        id: true,
        name: true,
        nameAr: true,
        slug: true,
        timezone: true,
        description: true,
        descriptionAr: true,
        logoUrl: true,
        coverImageUrl: true,
        address: true,
        phone: true,
        businessHoursText: true,
        businessHoursTextAr: true,
        workingDays: true,
        openTime: true,
        closeTime: true,
        customerCancellationEnabled: true,
        seats: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // public, unauthenticated detail lookup by slug - same isActive:true
  // filter and field shape as listPublic() above, but 404 (not a
  // distinguishing error) for both "no such slug" and "suspended", same
  // reasoning DATA-MODEL-V2.md already states for getOwned(): don't tell
  // an attacker probing slugs the difference between "doesn't exist" and
  // "got banned".
  async getPublicBySlug(slug: string) {
    const platform = await this.prisma.platform.findFirst({
      where: { slug, isActive: true },
      select: {
        id: true,
        name: true,
        nameAr: true,
        slug: true,
        timezone: true,
        description: true,
        descriptionAr: true,
        logoUrl: true,
        coverImageUrl: true,
        address: true,
        phone: true,
        businessHoursText: true,
        businessHoursTextAr: true,
        workingDays: true,
        openTime: true,
        closeTime: true,
        customerCancellationEnabled: true,
        seats: true,
      },
    });
    if (!platform) throw new NotFoundException('No such platform.');
    return platform;
  }

  // a scoped key can only ever "see" the one platform it's restricted to -
  // without this, "list my platforms" would leak the existence (id, name,
  // slug) of the owner's other platforms even though a scoped key can't
  // act on them. see ADR-001.
  listForOwner(ownerId: string, callerPlatformId?: string) {
    return this.prisma.platform.findMany({
      where: { ownerId, ...(callerPlatformId ? { id: callerPlatformId } : {}) },
      orderBy: { createdAt: 'asc' },
    });
  }

  // every other module's ownership check funnels through this one method —
  // 404, never 403, for a platform that exists but isn't yours. callerPlatformId
  // is the scoped-key restriction (ADR-001): when set and it doesn't match,
  // same 404 as a non-owner gets - no new error shape, no new status code.
  async getOwned(ownerId: string, platformId: string, callerPlatformId?: string) {
    if (callerPlatformId && callerPlatformId !== platformId) {
      throw new NotFoundException('No such platform.');
    }
    const platform = await this.prisma.platform.findFirst({
      where: { id: platformId, ownerId },
    });
    if (!platform) throw new NotFoundException('No such platform.');
    return platform;
  }

  async update(ownerId: string, platformId: string, dto: UpdatePlatformDto, callerPlatformId?: string) {
    await this.getOwned(ownerId, platformId, callerPlatformId);
    return this.prisma.platform.update({
      where: { id: platformId },
      data: dto,
    });
  }

  // exposed (not private) so AdminPlatformsService.createForOwner() can
  // reuse the exact same slug-uniqueness logic rather than duplicating it.
  async uniqueSlug(name: string): Promise<string> {
    const base = slugify(name) || 'platform';
    let candidate = base;
    while (await this.prisma.platform.findUnique({ where: { slug: candidate } })) {
      candidate = `${base}-${randomBytes(2).toString('hex')}`;
    }
    return candidate;
  }
}
