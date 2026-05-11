import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jwt, { SignOptions } from 'jsonwebtoken';
import { AuthUser } from '../../types/auth-user';

@Injectable()
export class JwtUtil {
  constructor(private readonly configService: ConfigService) {}

  signToken(payload: AuthUser): string {
    const secret = this.configService.get<string>('JWT_SECRET');
    const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN') ?? '7d';

    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }

    return jwt.sign(payload, secret, { expiresIn } as SignOptions);
  }

  verifyToken(token: string): AuthUser {
    const secret = this.configService.get<string>('JWT_SECRET');

    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }

    try {
      return jwt.verify(token, secret) as AuthUser;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
