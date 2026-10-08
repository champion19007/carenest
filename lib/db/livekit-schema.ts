export const LIVEKIT = `
ALTER TABLE provider.doctors ADD COLUMN video_provider TEXT NOT NULL DEFAULT 'livekit' CHECK(video_provider IN ('livekit','google'));
CREATE INDEX video_sessions_external_provider ON video_sessions(provider,external_id);
`;
