export const PROVIDER_KYC = `
ALTER TABLE private_files ADD COLUMN evidence_kind TEXT CHECK(evidence_kind IN ('IDENTITY','REGISTRATION','QUALIFICATION','CLINIC'));
ALTER TABLE private_files ADD CONSTRAINT kyc_evidence_context CHECK(evidence_kind IS NULL OR application_id IS NOT NULL);
ALTER TABLE provider.applications ADD COLUMN consent_at TIMESTAMPTZ;
ALTER TABLE provider.applications ADD COLUMN evidence_snapshot JSONB;
ALTER TABLE provider.applications ADD COLUMN policy_version TEXT;
CREATE TABLE provider.kyc_reviews (
 id TEXT PRIMARY KEY,application_id TEXT NOT NULL REFERENCES provider.applications(id),
 application_revision INT NOT NULL,reviewer_id TEXT NOT NULL REFERENCES admins(id),
 decision TEXT NOT NULL CHECK(decision IN ('APPROVED','NEEDS_CHANGES','REJECTED')),
 checks JSONB NOT NULL,source_url TEXT,source_reference TEXT,reason TEXT NOT NULL,
 evidence_snapshot JSONB,policy_version TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(application_id,application_revision)
);
CREATE INDEX kyc_file_checklist ON private_files(application_id,evidence_kind,created_at DESC);
CREATE TABLE provider.demo_catalogue_archive (
 doctor_id TEXT PRIMARY KEY REFERENCES provider.doctors(id),previous_status TEXT NOT NULL,
 reason TEXT NOT NULL,archived_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE patient.pets DROP CONSTRAINT pets_species_check;
ALTER TABLE patient.pets ADD CONSTRAINT pets_species_check CHECK(species IN ('dog','cat','rabbit','bird','cattle','fish','other'));
`;
