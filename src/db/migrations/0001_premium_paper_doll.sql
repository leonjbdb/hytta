ALTER TABLE `cottage_settings` ADD `description` text;--> statement-breakpoint
ALTER TABLE `user` ADD `first_login_completed_at` integer;--> statement-breakpoint
UPDATE `user`
SET `first_login_completed_at` = `created_at`
WHERE `name` IS NOT NULL AND length(trim(`name`)) > 0;
