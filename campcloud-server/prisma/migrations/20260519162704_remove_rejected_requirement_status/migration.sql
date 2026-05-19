UPDATE `requirements`
SET `status` = 'processing'
WHERE `status` = 'rejected';

UPDATE `requirement_status_logs`
SET `from_status` = 'processing'
WHERE `from_status` = 'rejected';

UPDATE `requirement_status_logs`
SET `to_status` = 'processing'
WHERE `to_status` = 'rejected';

ALTER TABLE `requirements`
MODIFY `status` ENUM('pending', 'processing', 'waiting_user', 'completed') NOT NULL DEFAULT 'pending';

ALTER TABLE `requirement_status_logs`
MODIFY `from_status` ENUM('pending', 'processing', 'waiting_user', 'completed') NULL;

ALTER TABLE `requirement_status_logs`
MODIFY `to_status` ENUM('pending', 'processing', 'waiting_user', 'completed') NOT NULL;
