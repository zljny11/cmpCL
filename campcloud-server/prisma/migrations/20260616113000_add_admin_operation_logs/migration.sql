-- CreateTable
CREATE TABLE `admin_operation_logs` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `actor_id` BIGINT UNSIGNED NULL,
    `actor_username` VARCHAR(64) NOT NULL,
    `category` ENUM('auth', 'user', 'requirement', 'data') NOT NULL,
    `action` VARCHAR(128) NOT NULL,
    `target_type` VARCHAR(64) NULL,
    `target_id` VARCHAR(128) NULL,
    `target_name` VARCHAR(255) NULL,
    `result` ENUM('success', 'failed') NOT NULL DEFAULT 'success',
    `detail` JSON NULL,
    `ip_address` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `admin_operation_logs_actor_id_idx`(`actor_id`),
    INDEX `admin_operation_logs_category_idx`(`category`),
    INDEX `admin_operation_logs_result_idx`(`result`),
    INDEX `admin_operation_logs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `admin_operation_logs` ADD CONSTRAINT `admin_operation_logs_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
