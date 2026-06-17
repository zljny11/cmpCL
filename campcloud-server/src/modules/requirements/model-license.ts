import { BadRequestException, ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import { Buffer } from 'node:buffer';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const ENCRYPTED_MODEL_MAGIC = Buffer.from('CCMODEL1', 'ascii');
export const ENCRYPTED_MODEL_VERSION = 1;
export const ENCRYPTED_MODEL_IV_LENGTH = 16;

export type ModelLicenseValidationResult = {
  licenseKeyBase64: string;
};

export type EncryptedModelMetadata = {
  version: number;
  requirementId: string;
  deliveryId: string | null;
  authorizedUserId: string | null;
  authorizedUsername: string | null;
  authorizedHospitalName: string | null;
  originalFileName: string;
  encryptedFileName: string;
  modelSha256: string;
  modelKey: string;
  createdAt: string;
};

export function getEncryptedModelSidecarPath(filePath: string) {
  return `${filePath}.license.json`;
}

export function normalizeLicenseKeyBase64(rawLicenseText: string) {
  const normalized = rawLicenseText.trim();
  if (!normalized) {
    throw new BadRequestException('license 文件为空');
  }

  let decoded: Buffer;
  try {
    decoded = Buffer.from(normalized, 'base64');
  } catch {
    throw new BadRequestException('license 文件不是有效的 base64 密钥');
  }

  if (decoded.length !== 32) {
    throw new ForbiddenException('license 密钥长度不正确');
  }

  return decoded.toString('base64');
}

type UserLicenseConfig = {
  users: Record<string, string>;
};

async function resolveUserLicenseConfigPath() {
  const candidates = [
    resolve(process.cwd(), 'license', 'user-licenses.json'),
    resolve(process.cwd(), '..', 'license', 'user-licenses.json'),
    resolve(__dirname, '..', '..', '..', '..', '..', 'license', 'user-licenses.json'),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new InternalServerErrorException('未找到用户 license 配置文件，请先准备 license/user-licenses.json');
}

async function readUserLicenseConfig() {
  const configPath = await resolveUserLicenseConfigPath();
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(configPath, 'utf8'));
  } catch {
    throw new InternalServerErrorException('用户 license 配置文件不是有效 JSON');
  }

  if (!parsed || typeof parsed !== 'object' || !('users' in parsed)) {
    throw new InternalServerErrorException('用户 license 配置文件缺少 users 字段');
  }

  const users = (parsed as UserLicenseConfig).users;
  if (!users || typeof users !== 'object') {
    throw new InternalServerErrorException('用户 license 配置文件 users 字段格式不正确');
  }

  return users;
}

export async function getConfiguredLicenseKeyForUser(userId: bigint) {
  const users = await readUserLicenseConfig();
  const rawKey = users[userId.toString()];
  if (!rawKey) {
    throw new ForbiddenException(`用户 ${userId.toString()} 未配置 license 密钥`);
  }
  return normalizeLicenseKeyBase64(rawKey);
}

export async function validateModelLicenseFile(
  licenseBuffer: Buffer,
  expectedUserId: bigint,
  expectedRequirementId: bigint,
  expectedDeliveryId: bigint,
  metadata: EncryptedModelMetadata,
): Promise<ModelLicenseValidationResult> {
  const licenseKeyBase64 = normalizeLicenseKeyBase64(licenseBuffer.toString('utf8'));

  if (metadata.version !== ENCRYPTED_MODEL_VERSION) {
    throw new ForbiddenException('不支持的加密模型版本');
  }

  if (metadata.requirementId !== expectedRequirementId.toString()) {
    throw new ForbiddenException('license 与当前需求单不匹配');
  }

  if (metadata.deliveryId && metadata.deliveryId !== expectedDeliveryId.toString()) {
    throw new ForbiddenException('license 与当前交付文件不匹配');
  }

  if (metadata.authorizedUserId !== expectedUserId.toString()) {
    throw new ForbiddenException('当前用户不是该 license 的授权用户');
  }

  if (metadata.modelKey !== licenseKeyBase64) {
    throw new ForbiddenException('license 密钥与当前加密模型不匹配');
  }

  return { licenseKeyBase64 };
}
