import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { hash } from 'bcryptjs';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { ListUsersDto } from './dto/list-users.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  private serializeUser(user: {
    id: bigint;
    username: string;
    role: UserRole;
    hospitalName: string;
    status: UserStatus;
    createdAt: Date;
    lastLoginAt: Date | null;
    profile: {
      realName: string | null;
      email: string | null;
      phone: string | null;
      wechat: string | null;
      department: string | null;
      title: string | null;
      remark: string | null;
    } | null;
    requirements?: Array<{
      id: bigint;
      title: string;
      status: string;
      createdAt: Date;
    }>;
  }) {
    return {
      id: user.id.toString(),
      username: user.username,
      role: user.role,
      hospitalName: user.hospitalName,
      status: user.status,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      passwordDisplay: '不可查看明文，可重置',
      profile: user.profile
        ? {
            realName: user.profile.realName,
            email: user.profile.email,
            phone: user.profile.phone,
            wechat: user.profile.wechat,
            department: user.profile.department,
            title: user.profile.title,
            remark: user.profile.remark,
          }
        : null,
      requirements:
        user.requirements?.map((requirement) => ({
          id: requirement.id.toString(),
          title: requirement.title,
          status: requirement.status,
          createdAt: requirement.createdAt,
        })) ?? [],
    };
  }

  findByUsername(username: string) {
    return this.prisma.user.findUnique({
      where: { username },
      include: { profile: true },
    });
  }

  findById(id: bigint) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { profile: true },
    });
  }

  async listUsers(query: ListUsersDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const keyword = query.keyword?.trim();

    const where = keyword
      ? {
          OR: [
            { username: { contains: keyword } },
            { hospitalName: { contains: keyword } },
            { profile: { realName: { contains: keyword } } },
          ],
        }
      : {};

    const [total, list] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          profile: true,
          requirements: {
            select: {
              id: true,
              title: true,
              status: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
    ]);

    return {
      list: list.map((item) => this.serializeUser(item)),
      total,
      page,
      pageSize,
    };
  }

  async createUser(dto: CreateAdminUserDto) {
    const username = dto.username.trim();
    const hospitalName = dto.hospitalName.trim();
    const passwordHash = await hash(dto.password, 10);

    const created = await this.prisma.user.create({
      data: {
        username,
        passwordHash,
        role: dto.role ?? UserRole.user,
        status: dto.status ?? UserStatus.active,
        hospitalName,
        profile:
          dto.realName ||
          dto.email ||
          dto.phone ||
          dto.wechat ||
          dto.department ||
          dto.title ||
          dto.remark
            ? {
                create: {
                  realName: dto.realName?.trim() || null,
                  email: dto.email?.trim().toLowerCase() || null,
                  phone: dto.phone?.trim() || null,
                  wechat: dto.wechat?.trim() || null,
                  department: dto.department?.trim() || null,
                  title: dto.title?.trim() || null,
                  remark: dto.remark?.trim() || null,
                },
              }
            : undefined,
      },
      include: {
        profile: true,
        requirements: {
          select: {
            id: true,
            title: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    return this.serializeUser(created);
  }

  async updateUser(id: bigint, dto: UpdateAdminUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      include: { profile: true },
    });

    if (!existing) {
      throw new NotFoundException('用户不存在');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        username: dto.username?.trim() || undefined,
        hospitalName: dto.hospitalName?.trim() || undefined,
        role: dto.role,
        status: dto.status,
        passwordHash: dto.password ? await hash(dto.password, 10) : undefined,
        profile:
          dto.realName !== undefined ||
          dto.email !== undefined ||
          dto.phone !== undefined ||
          dto.wechat !== undefined ||
          dto.department !== undefined ||
          dto.title !== undefined ||
          dto.remark !== undefined
            ? {
                upsert: {
                  update: {
                    realName: dto.realName?.trim() || null,
                    email: dto.email?.trim().toLowerCase() || null,
                    phone: dto.phone?.trim() || null,
                    wechat: dto.wechat?.trim() || null,
                    department: dto.department?.trim() || null,
                    title: dto.title?.trim() || null,
                    remark: dto.remark?.trim() || null,
                  },
                  create: {
                    realName: dto.realName?.trim() || null,
                    email: dto.email?.trim().toLowerCase() || null,
                    phone: dto.phone?.trim() || null,
                    wechat: dto.wechat?.trim() || null,
                    department: dto.department?.trim() || null,
                    title: dto.title?.trim() || null,
                    remark: dto.remark?.trim() || null,
                  },
                },
              }
            : undefined,
      },
      include: {
        profile: true,
        requirements: {
          select: {
            id: true,
            title: true,
            status: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    return this.serializeUser(updated);
  }

  async deleteUser(id: bigint, currentUserId: bigint) {
    if (id === currentUserId) {
      throw new BadRequestException('不能删除当前登录管理员');
    }

    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true, hospitalName: true },
    });
    if (!existing) {
      throw new NotFoundException('用户不存在');
    }

    await this.prisma.user.delete({ where: { id } });
    return {
      id: existing.id.toString(),
      username: existing.username,
      hospitalName: existing.hospitalName,
    };
  }
}
