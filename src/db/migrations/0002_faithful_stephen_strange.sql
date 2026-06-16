CREATE TABLE `email_change_token` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`new_email` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_change_token_token_hash_unique` ON `email_change_token` (`token_hash`);--> statement-breakpoint
CREATE INDEX `email_change_token_user_idx` ON `email_change_token` (`user_id`);