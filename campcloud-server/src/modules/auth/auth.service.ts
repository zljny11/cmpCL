import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { compare } from 'bcryptjs';
import { JwtUtil } from '../../common/utils/jwt';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { UserService } from '../users/user.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtUtil: JwtUtil,
    private readonly prisma: PrismaService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.userService.findByUsername(dto.username);

    if (!user || user.status !== UserStatus.active) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    if (dto.hospitalName && dto.hospitalName !== user.hospitalName) {
      throw new UnauthorizedException('医院信息不匹配');
    }

    const matched = await compare(dto.password, user.passwordHash);

    if (!matched) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    const authUser = {
      id: user.id.toString(),
      username: user.username,
      role: user.role,
      hospitalName: user.hospitalName,
    };

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      token: this.jwtUtil.signToken(authUser),
      user: authUser,
    };
  }

  async me(userId: bigint) {
    const user = await this.userService.findById(userId);

    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }

    return {
      id: user.id.toString(),
      username: user.username,
      role: user.role,
      hospitalName: user.hospitalName,
      status: user.status,
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
    };
  }
}
