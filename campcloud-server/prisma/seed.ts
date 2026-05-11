import { PrismaClient, UserRole } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await hash('123456', 10);

  const users = [
    {
      username: 'admin',
      role: UserRole.admin,
      hospitalName: 'admin',
      profile: { realName: '管理员', department: '平台运营', title: '系统管理员' },
    },
    {
      username: 'demo',
      role: UserRole.user,
      hospitalName: 'admin',
      profile: { realName: '示例用户', department: '放射科', title: '主治医师' },
    },
  ];

  for (const item of users) {
    await prisma.user.upsert({
      where: { username: item.username },
      update: {
        passwordHash,
        role: item.role,
        hospitalName: item.hospitalName,
      },
      create: {
        username: item.username,
        passwordHash,
        role: item.role,
        hospitalName: item.hospitalName,
        profile: { create: item.profile },
      },
    });
  }
}

main()
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
