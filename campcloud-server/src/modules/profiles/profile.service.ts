import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: bigint) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      return {
        userId: userId.toString(),
        realName: null,
        email: null,
        phone: null,
        wechat: null,
        department: null,
        title: null,
        remark: null,
      };
    }

    return {
      id: profile.id.toString(),
      userId: profile.userId.toString(),
      realName: profile.realName,
      email: profile.email,
      phone: profile.phone,
      wechat: profile.wechat,
      department: profile.department,
      title: profile.title,
      remark: profile.remark,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }

  async updateProfile(userId: bigint, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    const profile = await this.prisma.userProfile.upsert({
      where: { userId },
      update: dto,
      create: {
        userId,
        ...dto,
      },
    });

    return {
      id: profile.id.toString(),
      userId: profile.userId.toString(),
      realName: profile.realName,
      email: profile.email,
      phone: profile.phone,
      wechat: profile.wechat,
      department: profile.department,
      title: profile.title,
      remark: profile.remark,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }
}
