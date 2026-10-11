export const DEMO_DISCOVERY_SCHEMA = `
CREATE TABLE provider.demo_catalogue_settings (
 id INTEGER PRIMARY KEY CHECK(id=1), enabled BOOLEAN NOT NULL DEFAULT false
);
`;
