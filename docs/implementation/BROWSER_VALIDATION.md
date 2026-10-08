# Local browser verification — 8 October 2026

Verified against the actual local app, using fictional samples only. No real consultations, messages, video calls, collection services or payments were performed.

## Observed workflows

- Local OTP sign-in for sample doctor 9000000001.
- Selected a published GP slot, checked sharing consent and submitted. The patient page said requested/awaiting clinic confirmation rather than claiming confirmation.
- The assigned clinician request queue received that request. Acceptance changed the stored/rendered state to confirmed.
- Patient check-in appeared in the clinic calendar. Clinician start recorded its actual timestamp.
- A note explicitly labelled fictional/non-clinical saved to the assigned encounter and appeared in readable saved records. Required service ownership/audit behavior is additionally tested in the suite.
- Added fictional pet Local test Milo. Dog filtering excluded unsupported sample specialties. The vet booking form listed the owned pet; the saved veterinary request identified the pet separately from its owner.
- The labelled sample laboratory request created an owned order with REQUESTED state and UNPAID invoice. No actual diagnostic test was implied or performed.
- Rebuilt clinic UI showed the signed-in provider’s actual clinic name, a functional assigned-encounter search/navigation and IST timestamps.
- Development startup succeeded, including signed worker POSTs returning 200. Its first homepage request required development compilation; subsequent requests completed normally. Production startup/build were verified separately.

## Phone and desktop

At 390×844, document width was 375 pixels including the browser’s scrollbar behavior, with no horizontal page overflow. Bottom navigation, request cards and pet selection were visible. Viewport was reset to the browser default for the final desktop preview.

Screenshots are retained only in the local ignored screenshots/ directory because they can contain account or clinical information. They are not published with the source.

Browser coverage is focused, not an accessibility certification or exhaustive device matrix. External OAuth, camera/microphone, real gateway delivery/payment and actual call behavior require configured provider accounts. Google Calendar cleanup removes the event; hosts must manage previously shared Meet links/admission and ongoing calls through their provider.

Fictional test data remains in the local database, including the sample pet, appointment history, note and lab request. Private snapshots preserve the earlier state. The saved note is intentionally immutable; no audit history was silently removed.