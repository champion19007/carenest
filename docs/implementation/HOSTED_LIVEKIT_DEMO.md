# Hosted LiveKit video demo

The app uses a public LiveKit Cloud project for hosted calls and a separate loopback LiveKit server for local development. API secrets stay on the server. Recording, chat, screen sharing and room administration are not granted to participants.

Production configuration: `LIVEKIT_URL` must be a secure `wss://` server; `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` are private. Enable `CARENEST_DEMO_BOOKING=1` with Cashfree sandbox credentials, then `CARENEST_DEMO_VIDEO=1` and `CARENEST_DEMO_VIDEO_HOST_ID` for the explicitly designated existing account. The host must remain active. This configuration does not change its patient role, KYC status, clinic membership or access to clinical records. Disabling either demo flag stops further joins.

For the owner demo, the account associated with the approved test phone hosts calls. Sign in with that account and open **Your appointments → Open demo video host** (`/account/demo-video`). The host list contains sample profile names and appointment times; it omits patient names, contacts and medical records.

Use a different signed-in patient account to choose a sample profile offering video, select Video/date/time, consent to the video provider and complete Cashfree sandbox checkout. After the server verifies payment, the patient uses **Join video consultation** and the host opens the corresponding demo call. The host cannot book itself as the other participant. It cannot host overlapping sample video bookings; rescheduling checks the same shared host schedule.

Joining opens ten minutes before the appointment and closes thirty minutes after its end. Each join token lasts thirty seconds and permits only that opaque participant identity in that room, with camera/microphone publishing and subscription. Camera and microphone begin off. Cancellation, revoked consent, suspended accounts and changed/disabled hosting prevent new tokens; the existing active-session check disconnects callers after access changes. Reconciliation removes closed rooms and unexpected participants when the worker runs.

Calls are labelled demonstrations and provide no medical care. Hosted sample clinicians still cannot start/finish clinical consultations, write signed medical records or receive doctor payouts. Verified real clinicians retain the existing KYC, ownership and participant checks. Demo video supports LiveKit only; it does not activate Google/retired Zoom connections.

For phone testing, add the patient’s second phone to the permitted Twilio trial recipients yourself. The current hosted OTP budget is two sends per day across users. Keep host and patient browser sessions separate; signing into the same account on two devices produces one participant identity.

Automated service tests use synthetic accounts and mocked room operations against SQL. A synthetic LiveKit Cloud media check can prove transport connectivity separately. Neither proves physical camera/microphone permissions, mobile reconnect or a complete live signed-in payment/call workflow. Live browser QA previously required user approval for the public CareNest URL.
