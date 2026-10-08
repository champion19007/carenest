/** One-use exact-body permits for audited encryption and retention maintenance. */
export const MAINTENANCE = `
CREATE TABLE document_maintenance_permits (
 document_id TEXT PRIMARY KEY REFERENCES documents(id),operation TEXT NOT NULL CHECK(operation IN ('KEY_ROTATION','RETENTION_REDACTION')),
 old_body JSONB NOT NULL,new_body JSONB NOT NULL,approved_by TEXT NOT NULL,
 privacy_request_id TEXT REFERENCES patient.privacy_requests(id),policy_id TEXT REFERENCES review_policies(id),
 expires_at TIMESTAMPTZ NOT NULL DEFAULT now()+interval '30 seconds'
);
REVOKE ALL ON document_maintenance_permits FROM PUBLIC;
CREATE OR REPLACE FUNCTION scoped_records_are_immutable() RETURNS trigger AS $$
DECLARE permit document_maintenance_permits;
BEGIN
 IF OLD.collection IN ('chart_notes','prescriptions') AND OLD.encounter_id IS NOT NULL THEN
  IF TG_OP='UPDATE' AND (to_jsonb(NEW)-'body'-'lifecycle')=(to_jsonb(OLD)-'body'-'lifecycle') THEN
   SELECT * INTO permit FROM document_maintenance_permits WHERE document_id=OLD.id AND old_body=OLD.body AND new_body=NEW.body AND expires_at>=now() FOR UPDATE;
   IF FOUND AND jsonb_typeof(NEW.body->'_encrypted')='string' THEN
    IF permit.operation='KEY_ROTATION' AND NEW.lifecycle=OLD.lifecycle AND permit.approved_by='offline-local-maintenance' THEN
     DELETE FROM document_maintenance_permits WHERE document_id=OLD.id;
     RETURN NEW;
    END IF;
    IF permit.operation='RETENTION_REDACTION' AND NEW.lifecycle='RETENTION_ERASED'
      AND EXISTS(SELECT 1 FROM admins WHERE id=permit.approved_by AND totp_secret IS NOT NULL)
      AND EXISTS(SELECT 1 FROM review_policies WHERE id=permit.policy_id AND kind='PRIVACY' AND state='APPROVED')
      AND EXISTS(SELECT 1 FROM patient.privacy_requests r JOIN patient.users u ON u.id=r.user_id JOIN clinic.encounters e ON e.id=OLD.encounter_id WHERE r.id=permit.privacy_request_id AND r.kind='DELETION' AND r.state='COMPLETED_WITH_RETENTION' AND u.status='ERASED' AND (OLD.owner_id=u.id OR e.patient_user_id=u.id)) THEN
     DELETE FROM document_maintenance_permits WHERE document_id=OLD.id;
     RETURN NEW;
    END IF;
   END IF;
  END IF;
  RAISE EXCEPTION 'Signed clinical records are append-only; create an amendment';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
`;
