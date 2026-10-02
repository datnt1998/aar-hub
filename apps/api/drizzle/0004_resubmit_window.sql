CREATE TABLE "application_submissions" (
	"legal_form" text NOT NULL,
	"legal_id" text NOT NULL,
	"contact_email" text NOT NULL,
	"application_id" uuid NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	CONSTRAINT "application_submissions_legal_form_legal_id_contact_email_pk" PRIMARY KEY("legal_form","legal_id","contact_email")
);
--> statement-breakpoint
ALTER TABLE "application_submissions" ADD CONSTRAINT "application_submissions_application_id_partner_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."partner_applications"("id") ON DELETE no action ON UPDATE no action;