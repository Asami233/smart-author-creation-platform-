CREATE TABLE `workspace_preferences` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`active_work_id` text,
	`active_chapter_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`active_work_id`) REFERENCES `works`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`active_chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_workspace_active_work` ON `workspace_preferences` (`active_work_id`);