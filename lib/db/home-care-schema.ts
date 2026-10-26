export const HOME_CARE_SCHEMA = `
CREATE TABLE patient.home_care_requests (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES patient.users(id),
 service_kind TEXT NOT NULL CHECK(service_kind IN ('nursing','doctor_visit','care_home')),
 audience TEXT NOT NULL CHECK(audience IN ('human','pet')),
 family_id TEXT REFERENCES patient.family_members(id),pet_id TEXT REFERENCES patient.pets(id),
 city TEXT NOT NULL,pin_code TEXT CHECK(pin_code ~ '^[1-9][0-9]{5}$'),
 starts_on DATE NOT NULL,ends_on DATE,time_window TEXT NOT NULL CHECK(time_window IN ('flexible','morning','afternoon','evening')),
 encrypted_details TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK(status IN ('REQUESTED','REVIEWING','CONTACTED','CLOSED','CANCELLED')),
 revision INTEGER NOT NULL DEFAULT 0,request_key TEXT NOT NULL,request_hash TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK((audience='human' AND pet_id IS NULL) OR(audience='pet' AND pet_id IS NOT NULL AND family_id IS NULL)),
 CHECK((service_kind='care_home' AND ends_on IS NOT NULL AND ends_on>starts_on) OR(service_kind<>'care_home' AND ends_on IS NULL)),
 UNIQUE(user_id,request_key)
);
CREATE INDEX home_care_owner ON patient.home_care_requests(user_id,created_at DESC);
CREATE INDEX home_care_queue ON patient.home_care_requests(status,created_at) WHERE status IN ('REQUESTED','REVIEWING','CONTACTED');
`;
