const { readdir, rm, mkdir } = require('node:fs/promises');
const { existsSync } = require('node:fs');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { hash } = require('bcryptjs');

const projectRoot = path.resolve(__dirname, '..');
const prismaClientEntry = path.join(
  projectRoot,
  'node_modules',
  '.prisma',
  'client',
  'default.js',
);
const prismaBin = path.join(projectRoot, 'node_modules', '.bin', 'prisma');

function runPrismaGenerate() {
  return new Promise((resolve, reject) => {
    const child = spawn(prismaBin, ['generate'], {
      cwd: projectRoot,
      env: process.env,
      stdio: 'inherit',
    });

    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`prisma generate failed, code=${code} signal=${signal}`));
    });
  });
}

async function loadPrisma() {
  if (!existsSync(prismaClientEntry)) {
    console.warn('[reset-demo-state] Prisma client artifacts missing, regenerating...');
    await runPrismaGenerate();
  }

  return require('@prisma/client');
}

async function clearStorageFolder(relativeDir) {
  const root = path.resolve(__dirname, '..', 'storage', relativeDir);
  await mkdir(root, { recursive: true });
  const entries = await readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    await rm(path.join(root, entry.name), { recursive: true, force: true });
  }

  return entries.length;
}

async function main() {
  const { PrismaClient, UserRole } = await loadPrisma();
  const prisma = new PrismaClient();
  const passwordHash = await hash('123456', 10);
  const seedUsers = [
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
    {
      username: 'demo2',
      role: UserRole.user,
      hospitalName: '协和医院',
      profile: { realName: '第二测试用户', department: '影像科', title: '住院医师' },
    },
  ];

  try {
    const [
      notificationsResult,
      messagesResult,
      deliveriesResult,
      statusLogsResult,
      requirementsResult,
      seriesResult,
      studiesResult,
      patientsResult,
      batchesResult,
      extraUsersResult,
    ] = await prisma.$transaction([
      prisma.notification.deleteMany({}),
      prisma.message.deleteMany({}),
      prisma.delivery.deleteMany({}),
      prisma.requirementStatusLog.deleteMany({}),
      prisma.requirement.deleteMany({}),
      prisma.series.deleteMany({}),
      prisma.study.deleteMany({}),
      prisma.patient.deleteMany({}),
      prisma.datasetBatch.deleteMany({}),
      prisma.user.deleteMany({
        where: {
          username: {
            notIn: seedUsers.map((item) => item.username),
          },
        },
      }),
    ]);

    for (const item of seedUsers) {
      const user = await prisma.user.upsert({
        where: { username: item.username },
        update: {
          passwordHash,
          role: item.role,
          hospitalName: item.hospitalName,
          status: 'active',
          lastLoginAt: null,
        },
        create: {
          username: item.username,
          passwordHash,
          role: item.role,
          hospitalName: item.hospitalName,
          status: 'active',
        },
      });

      await prisma.userProfile.upsert({
        where: { userId: user.id },
        update: {
          realName: item.profile.realName,
          department: item.profile.department,
          title: item.profile.title,
          email: null,
          phone: null,
          wechat: null,
          remark: null,
        },
        create: {
          userId: user.id,
          realName: item.profile.realName,
          department: item.profile.department,
          title: item.profile.title,
        },
      });
    }

    const [removedUploadStorageCount, removedDeliveryStorageCount] = await Promise.all([
      clearStorageFolder('uploads'),
      clearStorageFolder('deliveries'),
    ]);

    console.log(
      JSON.stringify(
        {
          cleared: {
            notifications: notificationsResult.count,
            messages: messagesResult.count,
            deliveries: deliveriesResult.count,
            requirementStatusLogs: statusLogsResult.count,
            requirements: requirementsResult.count,
            datasetBatches: batchesResult.count,
            patients: patientsResult.count,
            studies: studiesResult.count,
            series: seriesResult.count,
            uploadStorageEntries: removedUploadStorageCount,
            deliveryStorageEntries: removedDeliveryStorageCount,
            extraUsers: extraUsersResult.count,
          },
          usersRemaining: seedUsers.map((item) => item.username),
          login: {
            admin: '123456',
            demo: '123456',
            demo2: '123456',
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  });
