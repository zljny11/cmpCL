import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { JwtUtil } from '../src/common/utils/jwt';
import { UserRole } from '@prisma/client';

describe('Auth & Permission Guards (P0)', () => {
  let jwtUtil: JwtUtil;
  let configService: ConfigService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      providers: [
        JwtUtil,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'JWT_SECRET') return 'test-secret-key';
              if (key === 'JWT_EXPIRES_IN') return '7d';
              return undefined;
            },
          },
        },
      ],
    }).compile();

    jwtUtil = moduleFixture.get<JwtUtil>(JwtUtil);
    configService = moduleFixture.get<ConfigService>(ConfigService);
  });

  describe('JWT Token Validation', () => {
    it('应该生成有效的 JWT token', () => {
      const authUser = {
        id: '1',
        username: 'testuser',
        role: UserRole.user,
        hospitalName: '医院名称',
      };
      const token = jwtUtil.signToken(authUser);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });

    it('应该正确验证有效的 token', () => {
      const authUser = {
        id: '1',
        username: 'testuser',
        role: UserRole.user,
        hospitalName: '医院名称',
      };
      const token = jwtUtil.signToken(authUser);
      const verified = jwtUtil.verifyToken(token);

      expect(verified).toBeDefined();
      expect(verified.username).toBe('testuser');
      expect(verified.role).toBe(UserRole.user);
    });

    it('应该拒绝过期或无效的 token', () => {
      expect(() => {
        jwtUtil.verifyToken('invalid.token.here');
      }).toThrow();
    });
  });

  describe('Role-based Access Control', () => {
    it('user role 应该被识别为非 admin', () => {
      const token = jwtUtil.signToken({
        id: '1',
        username: 'user',
        role: UserRole.user,
        hospitalName: '医院',
      });
      const decoded = jwtUtil.verifyToken(token);
      expect(decoded.role).not.toBe(UserRole.admin);
    });

    it('admin role 应该被识别', () => {
      const token = jwtUtil.signToken({
        id: '1',
        username: 'admin',
        role: UserRole.admin,
        hospitalName: '医院',
      });
      const decoded = jwtUtil.verifyToken(token);
      expect(decoded.role).toBe(UserRole.admin);
    });
  });
});
