CREATE TABLE `backup_import_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`snapshot_hash` text NOT NULL,
	`status` text NOT NULL,
	`imported_work_ids_json` text DEFAULT '[]' NOT NULL,
	`source_exported_at` text NOT NULL,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_backup_import_owner_snapshot` ON `backup_import_jobs` (`owner_id`,`snapshot_hash`);--> statement-breakpoint
CREATE INDEX `idx_backup_import_owner_created` ON `backup_import_jobs` (`owner_id`,`created_at`);