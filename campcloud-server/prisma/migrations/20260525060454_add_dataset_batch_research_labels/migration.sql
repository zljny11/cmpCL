-- AlterTable
ALTER TABLE `dataset_batches` ADD COLUMN `annotation_status` VARCHAR(32) NULL,
    ADD COLUMN `body_part` VARCHAR(64) NULL,
    ADD COLUMN `clinical_tags` JSON NULL,
    ADD COLUMN `diagnosis` JSON NULL,
    ADD COLUMN `modality` VARCHAR(32) NULL;
