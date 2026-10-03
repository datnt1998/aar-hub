-- Files uploaded ahead of an application that was never sent (the upload step removed by BE-22). They belong to no
-- application and nobody can reach them; the next migration makes application_id and kind NOT NULL.
DELETE FROM "attachments" WHERE "application_id" IS NULL OR "kind" IS NULL;
