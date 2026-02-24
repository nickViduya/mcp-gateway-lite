CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."auth_type" AS ENUM('none', 'api_key', 'bearer', 'oauth2');--> statement-breakpoint
CREATE TYPE "public"."exec_capability" AS ENUM('remote-direct', 'runner-required');--> statement-breakpoint
CREATE TYPE "public"."source" AS ENUM('official', 'pulsemcp', 'smithery');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('success', 'failed', 'partial');--> statement-breakpoint
CREATE TYPE "public"."transport" AS ENUM('stdio', 'streamable-http', 'sse');--> statement-breakpoint
CREATE TABLE "credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"service" text NOT NULL,
	"auth_type" "auth_type" NOT NULL,
	"encrypted" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "servers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text NOT NULL,
	"source" "source" NOT NULL,
	"source_url" text,
	"remote_url" text,
	"transport" "transport" NOT NULL,
	"version" text,
	"auth_type" "auth_type" DEFAULT 'none' NOT NULL,
	"auth_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"package_name" text,
	"package_registry" text,
	"exec_capability" "exec_capability" DEFAULT 'runner-required' NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"embedding" vector(1536),
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "source" NOT NULL,
	"status" "sync_status" NOT NULL,
	"servers_added" integer DEFAULT 0 NOT NULL,
	"servers_updated" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"input_schema" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tools" ADD CONSTRAINT "tools_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credentials_user_service_unique_idx" ON "credentials" USING btree ("user_id","service");--> statement-breakpoint
CREATE UNIQUE INDEX "servers_slug_unique_idx" ON "servers" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "servers_source_slug_unique_idx" ON "servers" USING btree ("source","slug");--> statement-breakpoint
CREATE INDEX "servers_source_idx" ON "servers" USING btree ("source");--> statement-breakpoint
CREATE INDEX "servers_is_active_idx" ON "servers" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "sync_logs_source_started_at_idx" ON "sync_logs" USING btree ("source","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tools_server_name_unique_idx" ON "tools" USING btree ("server_id","name");--> statement-breakpoint
CREATE INDEX "tools_server_id_idx" ON "tools" USING btree ("server_id");