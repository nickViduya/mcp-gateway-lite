ALTER TABLE "credentials" ALTER COLUMN "encrypted" SET DATA TYPE bytea USING decode("encrypted", 'base64');--> statement-breakpoint
ALTER TABLE "credentials" ALTER COLUMN "iv" SET DATA TYPE bytea USING decode("iv", 'base64');--> statement-breakpoint
ALTER TABLE "credentials" ALTER COLUMN "auth_tag" SET DATA TYPE bytea USING decode("auth_tag", 'base64');