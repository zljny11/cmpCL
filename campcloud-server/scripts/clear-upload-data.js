const { PrismaClient } = require('@prisma/client');
const { readdir, rm, mkdir } = require('node:fs/promises');
const path = require('node:path');

const prisma = new PrismaClient();

async function clearUploadStorage() {
  const uploadRoot = path.resolve(__dirname, '..', 'storage', 'uploads');
  await mkdir(uploadRoot, { recursive: true });
  const entries = await readdir(uploadRoot, { withFileTypes: true });

  for (const entry of entries) {
    await rm(path.join(uploadRoot, entry.name), { recursive: true, force: true });
  }

  return entries.length;
}

async function main() {
  const [seriesResult, studiesResult, patientsResult, batchesResult] = await prisma.$transaction([
    prisma.series.deleteMany({}),
    prisma.study.deleteMany({}),
    prisma.patient.deleteMany({}),
    prisma.datasetBatch.deleteMany({}),
  ]);

  const removedStorageCount = await clearUploadStorage();

  console.log(
    JSON.stringify(
      {
        cleared: {
          datasetBatches: batchesResult.count,
          patients: patientsResult.count,
          studies: studiesResult.count,
          series: seriesResult.count,
          storageEntries: removedStorageCount,
        },
      },
      null,
      2,
    ),
  );
}

main()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
