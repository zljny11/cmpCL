ALTER TABLE `requirement_oss_files`
    ADD COLUMN `pull_retry_count` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `last_pull_attempt_at` DATETIME(3) NULL;
