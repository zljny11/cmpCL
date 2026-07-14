import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
      passwordDisplay: 'Password is never returned in plaintext.',
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

  private getVisibleRoles(actorRole: UserRole) {
    return actorRole === UserRole.super_admin
      ? [UserRole.user, UserRole.admin, UserRole.super_admin]
      : [UserRole.user];
  }

  private assertRequestedRoleAllowed(actorRole: UserRole, requestedRole: UserRole | undefined) {
    if (!requestedRole) {
      return;
    }

    if (requestedRole === UserRole.super_admin) {
      throw new ForbiddenException('Super admin accounts cannot be created or assigned from this endpoint.');
    }

    if (actorRole === UserRole.admin && requestedRole !== UserRole.user) {
      throw new ForbiddenException('Admins can only manage regular user accounts.');
    }
  }

  private assertCanManageExistingUser(actorRole: UserRole, targetRole: UserRole) {
    if (targetRole === UserRole.super_admin && actorRole !== UserRole.super_admin) {
      throw new ForbiddenException('Super admin accounts are not manageable from this endpoint.');
    }

    if (actorRole === UserRole.admin && targetRole !== UserRole.user) {
      throw new ForbiddenException('Admins can only manage regular user accounts.');
    }
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

  async listUsers(actorRole: UserRole, query: ListUsersDto) {
    this.assertRequestedRoleAllowed(actorRole, query.role);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const keyword = query.keyword?.trim();
    const visibleRoles = query.role ? [query.role] : this.getVisibleRoles(actorRole);

    const where = {
      role: { in: visibleRoles },
      ...(keyword
        ? {
            OR: [
              { username: { contains: keyword } },
              { hospitalName: { contains: keyword } },
              { profile: { realName: { contains: keyword } } },
            ],
          }
        : {}),
    };

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

  async createUser(actorRole: UserRole, dto: CreateAdminUserDto) {
    const targetRole = dto.role ?? UserRole.user;
    this.assertRequestedRoleAllowed(actorRole, targetRole);

    const username = dto.username.trim();
    const hospitalName = dto.hospitalName.trim();
    const passwordHash = await hash(dto.password, 10);

    const created = await this.prisma.user.create({
      data: {
        username,
        passwordHash,
        role: targetRole,
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

  async updateUser(id: bigint, actorRole: UserRole, dto: UpdateAdminUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      include: { profile: true },
    });

    if (!existing) {
      throw new NotFoundException('User not found.');
    }

    this.assertCanManageExistingUser(actorRole, existing.role);

    if (existing.role === UserRole.super_admin) {
      if (dto.role && dto.role !== UserRole.super_admin) {
        throw new BadRequestException('Super admin accounts cannot be downgraded.');
      }
      if (dto.status === UserStatus.disabled) {
        throw new BadRequestException('Super admin accounts cannot be disabled.');
      }
    }

    if (dto.role && !(existing.role === UserRole.super_admin && dto.role === UserRole.super_admin)) {
      this.assertRequestedRoleAllowed(actorRole, dto.role);
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

  async deleteUser(id: bigint, currentUserId: bigint, actorRole: UserRole) {
    if (id === currentUserId) {
      throw new BadRequestException('You cannot delete the currently logged-in administrator.');
    }

    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true, hospitalName: true, role: true },
    });
    if (!existing) {
      throw new NotFoundException('User not found.');
    }

    this.assertCanManageExistingUser(actorRole, existing.role);

    if (existing.role === UserRole.super_admin) {
      throw new BadRequestException('Super admin accounts cannot be deleted.');
    }

    await this.prisma.user.delete({ where: { id } });
    return {
      id: existing.id.toString(),
      username: existing.username,
      hospitalName: existing.hospitalName,
      role: existing.role,
    };
  }
}

