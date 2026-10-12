# Hosted appointment demo

The public sample doctors can accept a labelled demonstration booking when `CARENEST_DEMO_BOOKING=1`, `ENABLE_PAYMENTS=1`, `CASHFREE_ENV=sandbox` and the private Cashfree sandbox credentials are configured on the host. Turning the demo flag off returns samples to a read-only catalogue. Real provider verification remains required.

Choose **Book demo appointment**, sign in, select a date/time and agree to appointment sharing. The server reserves that slot and saves an unpaid invoice. Cashfree sandbox checkout uses the saved invoice amount. Only server verification of a matching successful test payment confirms the saved appointment. Cancelling or failing payment does not schedule it. An expired reservation follows the existing reconciliation/refund process.

Sample profiles, checkout, account history and appointment messages identify the booking as a demonstration. No real doctor visit or medical care is arranged. Hosted samples offer a clinic booking simulation. LiveKit video simulations additionally require secure hosted credentials, an explicitly designated active test-host account and `CARENEST_DEMO_VIDEO=1`; see `HOSTED_LIVEKIT_DEMO.md`. Home medical services and clinician consultation privileges remain unavailable. Sample doctors are excluded from the payout queue even if someone accidentally adds verification metadata.

Set `APP_ORIGIN` and `APP_URL` to the hosted HTTPS origin. Keep local mode disabled and use the dedicated migrated PostgreSQL database. Creating or opening a provider page generates future slots from its published schedule rules; appointments and invoices persist in that database.

SMS sign-in uses the configured Twilio Verify service. For this hosted sandbox, `TWILIO_VERIFY_LOCAL_DAILY_LIMIT=2` caps all OTP requests across users at two per day. Provider failures also consume that budget. Twilio trial accounts can send only to permitted trial recipients. This is a limited owner demo, not public signup capacity. No OTP code is displayed or manufactured by the hosted app.

Booking/payment persistence tests mock Cashfree responses against a throwaway SQL database. They cover failed payment, successful capture, duplicate verification, ownership, sample labels and blocked clinical/payout privileges. The gateway dashboard and browser checkout must also be tested against the sandbox; mocks alone do not prove that a provider account or checkout-domain setting is ready.
