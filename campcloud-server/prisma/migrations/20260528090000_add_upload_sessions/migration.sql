-- CreateTable
CREATE TABLE `upload_sessions` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `requirement_id` BIGINT UNSIGNED NOT NULL,
    `dataset_batch_id` BIGINT UNSIGNED NULL,
    `uploaded_by` BIGINT UNSIGNED NOT NULL,
    `fingerprint` VARCHAR(64) NOT NULL,
    `file_name` VARCHAR(255) NOT NULL,
    `relative_path` VARCHAR(500) NOT NULL,
    `mime_type` VARCHAR(128) NULL,
    `file_size` BIGINT UNSIGNED NOT NULL,
    `uploaded_size` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `last_modified_at` DATETIME(3) NULL,
    `storage_path` VARCHAR(500) NOT NULL,
    `status` ENUM('pending', 'uploading', 'uploaded', 'consumed', 'failed') NOT NULL DEFAULT 'pending',
    `error_message` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `upload_sessions_requirement_id_uploaded_by_fingerprint_idx`(`requirement_id`, `uploaded_by`, `fingerprint`),
    INDEX `upload_sessions_requirement_id_status_idx`(`requirement_id`, `status`),
    INDEX `upload_sessions_dataset_batch_id_idx`(`dataset_batch_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `upload_sessions` ADD CONSTRAINT `upload_sessions_requirement_id_fkey` FOREIGN KEY (`requirement_id`) REFERENCES `requirements`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `upload_sessions` ADD CONSTRAINT `upload_sessions_dataset_batch_id_fkey` FOREIGN KEY (`dataset_batch_id`) REFERENCES `dataset_batches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `upload_sessions` ADD CONSTRAINT `upload_sessions_uploaded_by_fkey` FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
