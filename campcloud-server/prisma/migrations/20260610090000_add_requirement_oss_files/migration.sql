-- CreateEnum
CREATE TABLE `requirement_oss_files` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `requirement_id` BIGINT UNSIGNED NOT NULL,
    `uploaded_by` BIGINT UNSIGNED NOT NULL,
    `kind` ENUM('dicom', 'model') NOT NULL,
    `status` ENUM('pending_upload', 'uploaded', 'parsing', 'parsed', 'failed') NOT NULL DEFAULT 'pending_upload',
    `object_key` VARCHAR(500) NOT NULL,
    `bucket_name` VARCHAR(128) NOT NULL,
    `original_file_name` VARCHAR(255) NOT NULL,
    `mime_type` VARCHAR(128) NULL,
    `file_size` BIGINT UNSIGNED NOT NULL,
    `etag` VARCHAR(128) NULL,
    `model_name` VARCHAR(128) NULL,
    `model_version` VARCHAR(64) NULL,
    `parsed_object_key` VARCHAR(500) NULL,
    `parsed_payload` JSON NULL,
    `upload_completed_at` DATETIME(3) NULL,
    `parsed_at` DATETIME(3) NULL,
    `error_message` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `requirement_oss_files_bucket_name_object_key_key`(`bucket_name`, `object_key`),
    INDEX `requirement_oss_files_requirement_id_status_idx`(`requirement_id`, `status`),
    INDEX `requirement_oss_files_requirement_id_kind_idx`(`requirement_id`, `kind`),
    INDEX `requirement_oss_files_uploaded_by_created_at_idx`(`uploaded_by`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `requirement_oss_files` ADD CONSTRAINT `requirement_oss_files_requirement_id_fkey` FOREIGN KEY (`requirement_id`) REFERENCES `requirements`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `requirement_oss_files` ADD CONSTRAINT `requirement_oss_files_uploaded_by_fkey` FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
