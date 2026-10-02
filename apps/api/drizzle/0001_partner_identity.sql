ALTER TABLE "partners" ALTER COLUMN "tax_code" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "partner_applications" ADD COLUMN "citizen_id" text;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "citizen_id" text;--> statement-breakpoint
CREATE INDEX "partner_applications_citizen_id_idx" ON "partner_applications" USING btree ("citizen_id");--> statement-breakpoint
CREATE INDEX "partners_citizen_id_idx" ON "partners" USING btree ("citizen_id");