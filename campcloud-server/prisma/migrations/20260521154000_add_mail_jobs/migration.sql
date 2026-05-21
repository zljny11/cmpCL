-- CreateTable
CREATE TABLE `mail_jobs` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `requirement_id` BIGINT UNSIGNED NULL,
    `type` VARCHAR(32) NOT NULL,
    `to_email` VARCHAR(128) NOT NULL,
    `subject` VARCHAR(200) NOT NULL,
    `html` TEXT NOT NULL,
    `text` TEXT NULL,
    `status` ENUM('pending', 'sent', 'failed') NOT NULL DEFAULT 'pending',
    `retry_count` INTEGER NOT NULL DEFAULT 0,
    `last_error` VARCHAR(500) NULL,
    `sent_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `mail_jobs_status_retry_count_created_at_idx`(`status`, `retry_count`, `created_at`),
    INDEX `mail_jobs_user_id_idx`(`user_id`),
    INDEX `mail_jobs_requirement_id_idx`(`requirement_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `mail_jobs` ADD CONSTRAINT `mail_jobs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mail_jobs` ADD CONSTRAINT `mail_jobs_requirement_id_fkey` FOREIGN KEY (`requirement_id`) REFERENCES `requirements`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
