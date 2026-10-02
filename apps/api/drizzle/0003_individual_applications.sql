ALTER TABLE "partner_applications" ALTER COLUMN "tax_code" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "partners" ALTER COLUMN "tax_code" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "partner_applications" ADD COLUMN "citizen_id" text;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "citizen_id" text;--> statement-breakpoint
CREATE INDEX "partner_applications_citizen_id_idx" ON "partner_applications" USING btree ("citizen_id");--> statement-breakpoint
CREATE INDEX "partners_citizen_id_idx" ON "partners" USING btree ("citizen_id");--> statement-breakpoint
ALTER TABLE "partner_applications" ADD CONSTRAINT "partner_applications_legal_id_check" CHECK (("partner_applications"."legal_form" = 'tổ chức' AND "partner_applications"."tax_code" IS NOT NULL AND "partner_applications"."citizen_id" IS NULL) OR ("partner_applications"."legal_form" = 'cá nhân' AND "partner_applications"."citizen_id" IS NOT NULL AND "partner_applications"."tax_code" IS NULL));