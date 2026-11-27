CREATE TABLE "idle_intervals" (
	"id" text PRIMARY KEY NOT NULL,
	"office_id" text NOT NULL,
	"subject_id" text NOT NULL,
	"start" bigint NOT NULL,
	"end" bigint
);
--> statement-breakpoint
ALTER TABLE "presence_sessions" ADD COLUMN "start_reason" text;--> statement-breakpoint
ALTER TABLE "presence_sessions" ADD COLUMN "end_reason" text;--> statement-breakpoint
ALTER TABLE "presence_sessions" ADD COLUMN "client" text;--> statement-breakpoint
CREATE INDEX "idle_office_idx" ON "idle_intervals" USING btree ("office_id","start");