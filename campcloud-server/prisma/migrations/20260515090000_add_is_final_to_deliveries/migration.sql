ALTER TABLE `deliveries`
ADD COLUMN `is_final` TINYINT(1) NOT NULL DEFAULT 0 AFTER `file_name`;
