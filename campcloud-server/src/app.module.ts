import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { AdminLogsModule } from './modules/admin-logs/admin-logs.module';
import { AuthModule } from './modules/auth/auth.module';
import { ProfilesModule } from './modules/profiles/profile.module';
import { RequirementsModule } from './modules/requirements/requirement.module';
import { UsersModule } from './modules/users/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport: undefined,
      },
    }),
    PrismaModule,
    AdminLogsModule,
    UsersModule,
    AuthModule,
    ProfilesModule,
    RequirementsModule,
  ],
})
export class AppModule {}
