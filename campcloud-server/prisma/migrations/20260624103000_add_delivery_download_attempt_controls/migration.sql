ALTER TABLE deliveries
    ADD COLUMN user_download_failed_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN last_user_download_attempt_at DATETIME(3) NULL,
    ADD COLUMN last_user_download_failed_at DATETIME(3) NULL,
    ADD COLUMN user_download_locked_at DATETIME(3) NULL;