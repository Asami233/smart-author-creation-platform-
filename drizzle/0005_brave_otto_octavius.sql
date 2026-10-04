ALTER TABLE `chapters` ADD `client_save_id` text;--> statement-breakpoint
ALTER TABLE `chapters` ADD `content_format_version` integer DEFAULT 1 NOT NULL;