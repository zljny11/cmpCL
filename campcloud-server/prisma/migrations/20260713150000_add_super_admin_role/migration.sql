ALTER TABLE `users`
  MODIFY `role` ENUM('user', 'admin', 'super_admin') NOT NULL DEFAULT 'user';

ALTER TABLE `messages`
  MODIFY `sender_role` ENUM('user', 'admin', 'super_admin') NOT NULL;

ALTER TABLE `requirement_status_logs`
  MODIFY `changed_role` ENUM('user', 'admin', 'super_admin') NOT NULL;