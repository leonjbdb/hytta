CREATE TABLE `account` (
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`provider` text NOT NULL,
	`provider_account_id` text NOT NULL,
	`refresh_token` text,
	`access_token` text,
	`expires_at` integer,
	`token_type` text,
	`scope` text,
	`id_token` text,
	`session_state` text,
	PRIMARY KEY(`provider`, `provider_account_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `bed` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "bed_kind_valid" CHECK("bed"."kind" IN ('DOUBLE','SINGLE'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bed_label_unique` ON `bed` (`label`);--> statement-breakpoint
CREATE INDEX `bed_room_id_idx` ON `bed` (`room_id`);--> statement-breakpoint
CREATE TABLE `cottage_settings` (
	`id` text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "cottage_settings_singleton" CHECK("cottage_settings"."id" = 'singleton'),
	CONSTRAINT "cottage_settings_name_nonempty" CHECK(length(trim("cottage_settings"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE `dugnad_task` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`completed_by` text,
	`completed_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`completed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "dugnad_completed_shape" CHECK("dugnad_task"."completed_by" IS NULL OR "dugnad_task"."completed_at" IS NOT NULL),
	CONSTRAINT "dugnad_title_nonempty" CHECK(length(trim("dugnad_task"."title")) > 0),
	CONSTRAINT "dugnad_description_nonempty" CHECK(length(trim("dugnad_task"."description")) > 0)
);
--> statement-breakpoint
CREATE INDEX `dugnad_completed_at_idx` ON `dugnad_task` (`completed_at`);--> statement-breakpoint
CREATE INDEX `dugnad_created_by_idx` ON `dugnad_task` (`created_by`);--> statement-breakpoint
CREATE TABLE `group_member` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`user_id` text,
	`guest_name` text,
	`preferred_room_id` text,
	`preferred_bed_id` text,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `group_template`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`preferred_room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`preferred_bed_id`) REFERENCES `bed`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "group_member_participant_shape" CHECK(("group_member"."user_id" IS NOT NULL AND "group_member"."guest_name" IS NULL)
        OR ("group_member"."user_id" IS NULL AND "group_member"."guest_name" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `group_member_group_idx` ON `group_member` (`group_id`);--> statement-breakpoint
CREATE INDEX `group_member_user_idx` ON `group_member` (`user_id`);--> statement-breakpoint
CREATE TABLE `group_template` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `invitation` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`created_by` text NOT NULL,
	`max_uses` integer,
	`use_count` integer DEFAULT 0 NOT NULL,
	`email` text,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "invitation_max_uses_positive" CHECK("invitation"."max_uses" IS NULL OR "invitation"."max_uses" > 0),
	CONSTRAINT "invitation_use_count_nonneg" CHECK("invitation"."use_count" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitation_token_unique` ON `invitation` (`token`);--> statement-breakpoint
CREATE INDEX `invitation_created_by_idx` ON `invitation` (`created_by`);--> statement-breakpoint
CREATE TABLE `password_reset_token` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `password_reset_token_token_hash_unique` ON `password_reset_token` (`token_hash`);--> statement-breakpoint
CREATE INDEX `password_reset_token_user_idx` ON `password_reset_token` (`user_id`);--> statement-breakpoint
CREATE TABLE `reservation` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text,
	`booker_id` text,
	`user_id` text,
	`guest_name` text,
	`target_kind` text NOT NULL,
	`room_id` text,
	`bed_id` text,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`booker_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bed_id`) REFERENCES `bed`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "reservation_target_shape" CHECK(("reservation"."target_kind" = 'FULL_COTTAGE' AND "reservation"."room_id" IS NULL AND "reservation"."bed_id" IS NULL)
        OR ("reservation"."target_kind" = 'ROOM'         AND "reservation"."room_id" IS NOT NULL AND "reservation"."bed_id" IS NULL)
        OR ("reservation"."target_kind" = 'BED'          AND "reservation"."bed_id"  IS NOT NULL AND "reservation"."room_id" IS NULL)
        OR ("reservation"."target_kind" = 'SLOT'         AND "reservation"."room_id" IS NOT NULL AND "reservation"."bed_id" IS NULL)),
	CONSTRAINT "reservation_target_kind_valid" CHECK("reservation"."target_kind" IN ('FULL_COTTAGE','ROOM','BED','SLOT')),
	CONSTRAINT "reservation_participant_shape" CHECK(("reservation"."user_id" IS NOT NULL AND "reservation"."guest_name" IS NULL)
        OR ("reservation"."user_id" IS NULL AND "reservation"."guest_name" IS NOT NULL)),
	CONSTRAINT "reservation_status_valid" CHECK("reservation"."status" IN ('PENDING','CONFIRMED','CANCELLED')),
	CONSTRAINT "reservation_iso_dates" CHECK("reservation"."start_date" GLOB '????-??-??' AND "reservation"."end_date" GLOB '????-??-??'),
	CONSTRAINT "reservation_dates_ordered" CHECK("reservation"."start_date" <= "reservation"."end_date")
);
--> statement-breakpoint
CREATE INDEX `reservation_dates_idx` ON `reservation` (`start_date`,`end_date`);--> statement-breakpoint
CREATE INDEX `reservation_user_idx` ON `reservation` (`user_id`);--> statement-breakpoint
CREATE INDEX `reservation_status_target_idx` ON `reservation` (`status`,`target_kind`);--> statement-breakpoint
CREATE INDEX `reservation_booking_idx` ON `reservation` (`booking_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `reservation_id_idx` ON `reservation` (`id`);--> statement-breakpoint
CREATE TABLE `room` (
	`id` text PRIMARY KEY NOT NULL,
	`name_nb` text NOT NULL,
	`name_en` text NOT NULL,
	`icon` text NOT NULL,
	`color` text DEFAULT '#64748b' NOT NULL,
	`capacity_mode` text DEFAULT 'BEDS' NOT NULL,
	`slot_count` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT "room_capacity_mode_valid" CHECK("room"."capacity_mode" IN ('BEDS','SLOTS')),
	CONSTRAINT "room_slot_count_shape" CHECK(("room"."capacity_mode" = 'BEDS' AND "room"."slot_count" IS NULL)
        OR ("room"."capacity_mode" = 'SLOTS' AND ("room"."slot_count" IS NULL OR "room"."slot_count" > 0)))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_name_nb_unique` ON `room` (`name_nb`);--> statement-breakpoint
CREATE TABLE `session` (
	`session_token` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`first_name` text,
	`last_name` text,
	`email` text NOT NULL,
	`email_verified` integer,
	`image` text,
	`password_hash` text,
	`is_admin` integer DEFAULT false NOT NULL,
	`is_manager` integer DEFAULT false NOT NULL,
	`is_invitee` integer DEFAULT false NOT NULL,
	`notify_enabled` integer DEFAULT false NOT NULL,
	`notify_booking` integer DEFAULT true NOT NULL,
	`notify_requests` integer DEFAULT true NOT NULL,
	`calendar_token` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_calendar_token_unique` ON `user` (`calendar_token`);--> statement-breakpoint
CREATE TABLE `verification_token` (
	`identifier` text NOT NULL,
	`token` text NOT NULL,
	`expires` integer NOT NULL,
	PRIMARY KEY(`identifier`, `token`)
);
