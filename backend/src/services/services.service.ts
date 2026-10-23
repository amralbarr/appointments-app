import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformsService } from '../platforms/platforms.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platforms: PlatformsService,
  ) {}

  async list(ownerId: string, platformId: string, callerPlatformId?: string) {
    await this.platforms.getOwned(ownerId, platformId, callerPlatformId);
    return this.prisma.service.findMany({
      where: { platformId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(ownerId: string, platformId: string, dto: CreateServiceDto, callerPlatformId?: string) {
    await this.platforms.getOwned(ownerId, platformId, callerPlatformId);
    return this.prisma.service.create({
      data: { platformId, name: dto.name, nameAr: dto.nameAr, durationMinutes: dto.durationMinutes },
    });
  }

  async update(
    ownerId: string,
    platformId: string,
    serviceId: string,
    dto: UpdateServiceDto,
    callerPlatformId?: string,
  ) {
    await this.getOwnedService(ownerId, platformId, serviceId, callerPlatformId);
    return this.prisma.service.update({ where: { id: serviceId }, data: dto });
  }

  async remove(ownerId: string, platformId: string, serviceId: string, callerPlatformId?: string) {
    await this.getOwnedService(ownerId, platformId, serviceId, callerPlatformId);

    const futureSlots = await this.prisma.slot.count({
      where: { serviceId, startsAt: { gt: new Date() } },
    });
    if (futureSlots > 0) {
      throw new ConflictException(
        `This service still has ${futureSlots} upcoming slot(s). Remove those first.`,
      );
    }

    await this.prisma.service.delete({ where: { id: serviceId } });
  }

  private async getOwnedService(
    ownerId: string,
    platformId: string,
    serviceId: string,
    callerPlatformId?: string,
  ) {
    await this.platforms.getOwned(ownerId, platformId, callerPlatformId);
    const service = await this.prisma.service.findFirst({ where: { id: serviceId, platformId } });
    if (!service) throw new NotFoundException('No such service.');
    return service;
  }
}
