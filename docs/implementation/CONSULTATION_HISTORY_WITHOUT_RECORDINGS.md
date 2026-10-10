# Consultation history without video recordings

Owner decision, 9 October 2026: keep a history of consultations instead of recording calls.

CareNest's existing LiveKit interface has recording disabled. The application does not implement LiveKit recording/egress requests, and the managed local setup does not configure an egress recording service. No audio/video files were deleted by this change. Existing clinical notes, prescriptions, invoices and audit records are preserved. Recording outside CareNest, such as a participant's own screen recorder or separate meeting-provider settings, is outside this application change.

## Implemented

- `/account/history`: authenticated, responsive completed-consultation history.
- Doctor/veterinarian, specialty, clinic, visit date and time in IST including year, visit type, patient/family/pet name and completed label.
- Only appointments marked attended by the clinic appear. Requests, confirmed reservations, cancellations and no-shows remain in ordinary appointment history.
- Claimed attended clinic walk-ins appear only when both the clinic person and encounter belong to the signed-in account.
- Twenty visits per page with stable pagination for equal timestamps. Invalid links show a recovery link.
- Links from patient navigation, appointments and the video consultation screen.
- History refreshes after clinician completion, walk-in completion or claiming a clinic visit.

History reads use existing booking and encounter data. No new table, recording storage, transcription API or cloud service is introduced. Walk-in identities are decrypted on the server; only the subject's display name reaches the history page, not the contact or private reason for the visit.

## How to check it

1. Sign in and open **Appointments → Completed consultations**, or `/account/history`.
2. Have the assigned clinician mark a real appointment as attended using the existing visit controls.
3. Open history: it should show that consultation. A cancelled or missed visit should not appear there.
4. For a walk-in, claim the private visit receipt using the existing account flow; once attended, it appears in history.

Validation: six consultation-history tests pass, covering completion, ownership, family/pet labels, claimed/unclaimed walk-ins, private-field exclusion, pagination and invalid/suspended access. Thirty-seven related history, booking, clinic and LiveKit tests pass. Type checking and the production build pass. The local application was restarted successfully: homepage returns 200; anonymous history access redirects to sign-in with the history return path and `private, no-store` caching. The live signed-in screen was not browser-tested during this change.
