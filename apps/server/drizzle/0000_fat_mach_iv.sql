CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"office_id" text,
	"actor_id" text NOT NULL,
	"actor_name" text NOT NULL,
	"action" text NOT NULL,
	"target" text,
	"meta" jsonb,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_links" (
	"user_id" text PRIMARY KEY NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_segments" (
	"id" text PRIMARY KEY NOT NULL,
	"office_id" text NOT NULL,
	"a" text NOT NULL,
	"b" text NOT NULL,
	"area_id" text,
	"area_name" text,
	"start" bigint NOT NULL,
	"end" bigint
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"office_id" text NOT NULL,
	"scope" text NOT NULL,
	"from_id" text NOT NULL,
	"from_name" text NOT NULL,
	"to_id" text,
	"recipients" jsonb,
	"text" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "desk_items" (
	"id" text PRIMARY KEY NOT NULL,
	"office_id" text NOT NULL,
	"desk_id" text NOT NULL,
	"kind" text NOT NULL,
	"author_id" text NOT NULL,
	"author_name" text NOT NULL,
	"content" text NOT NULL,
	"emoji" text,
	"created_at" bigint NOT NULL,
	"seen_at" bigint
);
--> statement-breakpoint
CREATE TABLE "desks" (
	"office_id" text NOT NULL,
	"id" text NOT NULL,
	"user_id" text,
	CONSTRAINT "desks_office_id_id_pk" PRIMARY KEY("office_id","id")
);
--> statement-breakpoint
CREATE TABLE "guests" (
	"id" text PRIMARY KEY NOT NULL,
	"invite_id" text NOT NULL,
	"office_id" text NOT NULL,
	"display_name" text NOT NULL,
	"avatar" jsonb,
	"created_at" bigint NOT NULL,
	"ended_at" bigint
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" text PRIMARY KEY NOT NULL,
	"office_id" text NOT NULL,
	"kind" text NOT NULL,
	"token_hash" text NOT NULL,
	"label" text,
	"expires_at" bigint,
	"max_uses" integer,
	"uses" integer DEFAULT 0 NOT NULL,
	"revoked_at" bigint,
	"created_by" text,
	"created_by_name" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lost_found" (
	"id" text PRIMARY KEY NOT NULL,
	"office_id" text NOT NULL,
	"former_owner" text NOT NULL,
	"desk_id" text NOT NULL,
	"items" jsonb NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "map_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"office_id" text NOT NULL,
	"json" jsonb NOT NULL,
	"author_id" text,
	"author_name" text,
	"note" text,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_notes" (
	"meeting_id" text PRIMARY KEY NOT NULL,
	"transcript" text NOT NULL,
	"summary" text,
	"sent_to" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sent_at" bigint,
	"email_error" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_tracks" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" text NOT NULL,
	"subject_id" text NOT NULL,
	"subject_name" text NOT NULL,
	"track_sid" text NOT NULL,
	"egress_id" text,
	"file" text NOT NULL,
	"started_at" bigint NOT NULL,
	"deleted_at" bigint
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" text PRIMARY KEY NOT NULL,
	"office_id" text NOT NULL,
	"area_id" text NOT NULL,
	"area_name" text NOT NULL,
	"started_by" text NOT NULL,
	"started_by_name" text NOT NULL,
	"participants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"start" bigint NOT NULL,
	"end" bigint,
	"status" text NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "office_members" (
	"office_id" text NOT NULL,
	"user_id" text NOT NULL,
	"activated" boolean DEFAULT false NOT NULL,
	"last_x" integer,
	"last_y" integer,
	CONSTRAINT "office_members_office_id_user_id_pk" PRIMARY KEY("office_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "offices" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"desk_capacity" integer DEFAULT 0 NOT NULL,
	"planned_headcount" integer DEFAULT 0 NOT NULL,
	"expansion_dismissed_at" integer DEFAULT 0 NOT NULL,
	"map_version_id" text,
	"created_by" text,
	"created_at" bigint NOT NULL,
	CONSTRAINT "offices_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "presence_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"office_id" text NOT NULL,
	"subject_id" text NOT NULL,
	"subject_name" text NOT NULL,
	"role" text NOT NULL,
	"start" bigint NOT NULL,
	"end" bigint
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"guest_id" text,
	"created_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "status_intervals" (
	"id" text PRIMARY KEY NOT NULL,
	"office_id" text NOT NULL,
	"subject_id" text NOT NULL,
	"status" text NOT NULL,
	"start" bigint NOT NULL,
	"end" bigint
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text NOT NULL,
	"totp_secret_enc" text,
	"totp_enabled" boolean DEFAULT false NOT NULL,
	"recovery_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"monitoring_accepted_at" bigint,
	"profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"avatar" jsonb,
	"interaction_distance" integer DEFAULT 5 NOT NULL,
	"created_by" text,
	"created_at" bigint NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "whiteboards" (
	"office_id" text NOT NULL,
	"object_id" text NOT NULL,
	"elements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "whiteboards_office_id_object_id_pk" PRIMARY KEY("office_id","object_id")
);
--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "calls_office_idx" ON "call_segments" USING btree ("office_id","start");--> statement-breakpoint
CREATE INDEX "chat_office_idx" ON "chat_messages" USING btree ("office_id","created_at");--> statement-breakpoint
CREATE INDEX "desk_items_desk_idx" ON "desk_items" USING btree ("office_id","desk_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invites_token_idx" ON "invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "invites_office_idx" ON "invites" USING btree ("office_id");--> statement-breakpoint
CREATE INDEX "map_versions_office_idx" ON "map_versions" USING btree ("office_id","created_at");--> statement-breakpoint
CREATE INDEX "meeting_tracks_meeting_idx" ON "meeting_tracks" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "meetings_office_idx" ON "meetings" USING btree ("office_id","start");--> statement-breakpoint
CREATE INDEX "presence_office_idx" ON "presence_sessions" USING btree ("office_id","start");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_guest_idx" ON "sessions" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "status_office_idx" ON "status_intervals" USING btree ("office_id","start");