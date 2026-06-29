ALTER TABLE `dataset_batches` 
  MODIFY `status` ENUM('uploaded', 'parsed', 'failed', 'cleaned') NOT NULL DEFAULT 'uploaded';
