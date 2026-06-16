const { PrismaClient, UserRole } = require('@prisma/client');
const { hash } = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await hash('123456', 10);

  const users = [
    {
      username: 'admin1',
      role: UserRole.admin,
      hospitalName: 'AICampCloud',
      profile: { realName: '管理员1', department: '平台运营', title: '系统管理员' },
    },
    {
      username: 'admin2',
      role: UserRole.admin,
      hospitalName: 'AICampCloud',
      profile: { realName: '管理员2', department: '平台运营', title: '系统管理员' },
    },
    {
      username: 'demo',
      role: UserRole.user,
      hospitalName: 'admin',
      profile: { realName: '示例用户', department: '放射科', title: '主治医师' },
    },
    {
      username: 'demo2',
      role: UserRole.user,
      hospitalName: '协和医院',
      profile: { realName: '第二测试用户', department: '影像科', title: '住院医师' },
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
