import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailJob, Prisma } from '@prisma/client';
import nodemailer, { Transporter } from 'nodemailer';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { getManagementRoles } from '../../common/utils/roles';

type QueueRequirementUserNotificationParams = {
  requirementId: bigint;
  type: string;
  subject: string;
  requirementTitle: string;
  actionLabel: string;
  summary: string;
};

type QueueRequirementAdminNotificationParams = {
  requirementId: bigint;
  type: string;
  subject: string;
  requirementTitle: string;
  actionLabel: string;
  summary: string;
  excludeUserIds?: bigint[];
};

@Injectable()
export class MailService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailService.name);
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private readonly maxRetryCount: number;
  private transporter: Transporter | null = null;
  private timer: ReturnType<typeof globalThis.setInterval> | null = null;
  private isProcessing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.pollIntervalMs = this.parsePositiveInt(this.configService.get<string>('MAIL_POLL_INTERVAL_MS'), 15000);
    this.batchSize = this.parsePositiveInt(this.configService.get<string>('MAIL_BATCH_SIZE'), 10);
    this.maxRetryCount = this.parsePositiveInt(this.configService.get<string>('MAIL_MAX_RETRY_COUNT'), 5);
  }

  onModuleInit() {
    if (!this.isEnabled()) {
      this.logger.log('mail delivery disabled');
      return;
    }

    this.transporter = this.createTransporter();
    if (!this.transporter) {
      return;
    }

    this.timer = globalThis.setInterval(() => {
      void this.processPendingJobs();
    }, this.pollIntervalMs);

    void this.processPendingJobs();
  }

  onModuleDestroy() {
    if (this.timer) {
      globalThis.clearInterval(this.timer);
      this.timer = null;
    }
  }

  async queueRequirementUserNotification(
    tx: Prisma.TransactionClient,
    params: QueueRequirementUserNotificationParams,
  ) {
    if (!this.isEnabled()) {
      return;
    }

    const requirement = await tx.requirement.findUnique({
      where: { id: params.requirementId },
      select: {
        userId: true,
        user: {
          select: {
            username: true,
            profile: {
              select: {
                realName: true,
                email: true,
              },
            },
          },
        },
      },
    });

    const toEmail = requirement?.user.profile?.email?.trim();
    if (!requirement || !toEmail) {
      return;
    }

    const recipientName = requirement.user.profile?.realName?.trim() || requirement.user.username;
    const detailUrl = this.buildRequirementDetailUrl(params.requirementId);
    const rendered = this.renderRequirementNotificationMail({
      recipientName,
      subject: params.subject,
      requirementTitle: params.requirementTitle,
      actionLabel: params.actionLabel,
      summary: params.summary,
      detailUrl,
    });

    await tx.mailJob.create({
      data: {
        userId: requirement.userId,
        requirementId: params.requirementId,
        type: params.type,
        toEmail,
        subject: params.subject,
        html: rendered.html,
        text: rendered.text,
      },
    });
  }

  async queueRequirementAdminNotifications(
    tx: Prisma.TransactionClient,
    params: QueueRequirementAdminNotificationParams,
  ) {
    if (!this.isEnabled()) {
      return;
    }

    const excludedUserIds = new Set((params.excludeUserIds ?? []).map((item) => item.toString()));
    const admins = await tx.user.findMany({
      where: { role: { in: getManagementRoles() } },
      select: {
        id: true,
        username: true,
        profile: {
          select: {
            realName: true,
            email: true,
          },
        },
      },
    });

    const recipients = admins.filter((admin) => {
      const email = admin.profile?.email?.trim();
      return email && !excludedUserIds.has(admin.id.toString());
    });

    for (const admin of recipients) {
      const toEmail = admin.profile?.email?.trim();
      if (!toEmail) {
        continue;
      }

      const recipientName = admin.profile?.realName?.trim() || admin.username;
      const detailUrl = this.buildRequirementDetailUrl(params.requirementId, 'admin');
      const rendered = this.renderRequirementNotificationMail({
        recipientName,
        subject: params.subject,
        requirementTitle: params.requirementTitle,
        actionLabel: params.actionLabel,
        summary: params.summary,
        detailUrl,
      });

      await tx.mailJob.create({
        data: {
          userId: admin.id,
          requirementId: params.requirementId,
          type: params.type,
          toEmail,
          subject: params.subject,
          html: rendered.html,
          text: rendered.text,
        },
      });
    }
  }

  async sendVerificationCodeMail(params: {
    toEmail: string;
    recipientName: string;
    code: string;
    expireMinutes: number;
  }) {
    if (!this.isEnabled()) {
      throw new Error('mail delivery is disabled');
    }

    if (!this.transporter) {
      this.transporter = this.createTransporter();
    }

    if (!this.transporter) {
      throw new Error('mail transporter is not available');
    }

    const rendered = this.renderVerificationCodeMail(params);
    await this.transporter.sendMail({
      from: this.getMailFrom(),
      to: params.toEmail,
      subject: 'AICampCloud 邮箱验证码',
      html: rendered.html,
      text: rendered.text,
    });
  }

  async processPendingJobs() {
    if (!this.transporter || this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    try {
      const jobs = await this.prisma.mailJob.findMany({
        where: {
          status: { in: ['pending', 'failed'] },
          retryCount: { lt: this.maxRetryCount },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: this.batchSize,
      });

      for (const job of jobs) {
        await this.sendJob(job);
      }
    } catch (error) {
      this.logger.error(`mail job processor failed: ${this.describeError(error)}`);
    } finally {
      this.isProcessing = false;
    }
  }

  private async sendJob(job: MailJob) {
    if (!this.transporter) {
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.getMailFrom(),
        to: job.toEmail,
        subject: job.subject,
        html: job.html,
        text: job.text ?? undefined,
      });

      await this.prisma.mailJob.update({
        where: { id: job.id },
        data: {
          status: 'sent',
          sentAt: new Date(),
          lastError: null,
        },
      });
    } catch (error) {
      const message = this.describeError(error);
      await this.prisma.mailJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          retryCount: { increment: 1 },
          lastError: message.slice(0, 500),
        },
      });
      this.logger.warn(`mail job ${job.id.toString()} failed: ${message}`);
    }
  }

  private isEnabled() {
    return this.configService.get<string>('MAIL_ENABLED') === 'true';
  }

  private createTransporter() {
    const host = this.configService.get<string>('MAIL_HOST')?.trim();
    const port = Number(this.configService.get<string>('MAIL_PORT') ?? '0');
    const secure = (this.configService.get<string>('MAIL_SECURE') ?? 'false') === 'true';
    const user = this.configService.get<string>('MAIL_USER')?.trim();
    const pass = this.configService.get<string>('MAIL_PASS');

    if (!host || !port) {
      this.logger.warn('mail delivery enabled but MAIL_HOST or MAIL_PORT is missing');
      return null;
    }

    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    });
  }

  private getMailFrom() {
    return (
      this.configService.get<string>('MAIL_FROM')?.trim() ||
      this.configService.get<string>('MAIL_USER')?.trim() ||
      'no-reply@aicampcloud.local'
    );
  }

  private buildRequirementDetailUrl(requirementId: bigint, audience: 'user' | 'admin' = 'user') {
    const baseUrl =
      this.configService.get<string>('WEB_BASE_URL')?.trim() ||
      'http://127.0.0.1:5173';
    const path =
      audience === 'admin'
        ? `/admin/requirements/${requirementId.toString()}`
        : `/requirements/${requirementId.toString()}`;
    return `${baseUrl.replace(/\/+$/, '')}${path}`;
  }

  private renderRequirementNotificationMail(params: {
    recipientName: string;
    subject: string;
    requirementTitle: string;
    actionLabel: string;
    summary: string;
    detailUrl: string;
  }) {
    const escapedRecipientName = this.escapeHtml(params.recipientName);
    const escapedRequirementTitle = this.escapeHtml(params.requirementTitle);
    const escapedActionLabel = this.escapeHtml(params.actionLabel);
    const escapedSummary = this.escapeHtml(params.summary);
    const escapedDetailUrl = this.escapeHtml(params.detailUrl);

    return {
      html: `
        <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
          <p>${escapedRecipientName}，您好：</p>
          <p>您在 AICampCloud 提交的需求有新的处理动作。</p>
          <p><strong>需求标题：</strong>${escapedRequirementTitle}</p>
          <p><strong>动作类型：</strong>${escapedActionLabel}</p>
          <p><strong>内容摘要：</strong>${escapedSummary}</p>
          <p><a href="${escapedDetailUrl}">点击查看需求详情</a></p>
        </div>
      `.trim(),
      text: [
        `${params.recipientName}，您好：`,
        '您在 AICampCloud 提交的需求有新的处理动作。',
        `需求标题：${params.requirementTitle}`,
        `动作类型：${params.actionLabel}`,
        `内容摘要：${params.summary}`,
        `详情链接：${params.detailUrl}`,
      ].join('\n'),
    };
  }

  private renderVerificationCodeMail(params: {
    recipientName: string;
    code: string;
    expireMinutes: number;
  }) {
    const escapedRecipientName = this.escapeHtml(params.recipientName);
    const escapedCode = this.escapeHtml(params.code);
    const escapedExpireMinutes = this.escapeHtml(String(params.expireMinutes));

    return {
      html: `
        <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
          <p>${escapedRecipientName}，您好：</p>
          <p>您正在使用 AICampCloud 进行邮箱验证码登录/重置密码。</p>
          <p>验证码为：<strong style="font-size: 24px; letter-spacing: 4px;">${escapedCode}</strong></p>
          <p>验证码 ${escapedExpireMinutes} 分钟内有效，请勿泄露给他人。</p>
        </div>
      `.trim(),
      text: [
        `${params.recipientName}，您好：`,
        '您正在使用 AICampCloud 进行邮箱验证码登录/重置密码。',
        `验证码：${params.code}`,
        `验证码 ${params.expireMinutes} 分钟内有效，请勿泄露给他人。`,
      ].join('\n'),
    };
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private describeError(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  private parsePositiveInt(rawValue: string | undefined, fallbackValue: number) {
    const parsed = Number(rawValue);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallbackValue;
  }
}
