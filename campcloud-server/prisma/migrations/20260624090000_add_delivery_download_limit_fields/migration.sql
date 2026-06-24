ALTER TABLE deliveries
    ADD COLUMN user_download_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN first_user_downloaded_at DATETIME(3) NULL,
    ADD COLUMN last_user_downloaded_at DATETIME(3) NULL;