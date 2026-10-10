# BulkSMSHub OTP integration review

Checked 10 October 2026 for the user-confirmed provider `bulksmshub.com`.

## Current decision

Do not configure CareNest's real OTP delivery against an unverified endpoint or purchase a large messaging package yet. The website advertises OTP SMS, REST API access and a Node package, but the actual advertised API/SDK could not be verified in this session. The existing provider configuration was not replaced.

## Live observations

| Public endpoint | Result from this workspace |
| --- | --- |
| `https://api.bulksmshub.com/docs` | DNS lookup failed: ENOTFOUND. |
| `https://api.bulksmshub.com/v2/sms/send` (read-only GET, no credentials or recipient) | DNS lookup failed: ENOTFOUND. |
| `https://registry.npmjs.org/bulksmshub` | HTTP 404. |

These observations establish that the advertised integration was not usable from this environment at the time of checking. They do not establish the legal identity or reliability of the company. No CareNest credentials, patient details, real phone numbers or messages were sent to this provider.

## Published pricing claims

The India page advertises OTP SMS at ₹0.11 for 50,000–99,999 messages and ₹0.10 at 100,000+. At those claimed rates, 50,000 OTPs would cost ₹5,500 and 100,000 would cost ₹10,000 before additional charges. The lower promotional SMS price is a different route and must not be substituted into an OTP budget.

These are provider claims, not a verified quote or proven delivery cost. Obtain written confirmation of taxes, DLT charges, message segmentation, failed-message billing, minimum commitments, credit expiry, and whether OTP priority routing is included.

## What is needed before implementation

1. A reachable official API base URL and account-specific API documentation, including authentication, request/response fields and delivery receipts.
2. CareNest's approved Principal Entity ID, sender header, OTP content template ID and required delivery-chain binding. TRAI guidance explicitly covers bulk OTP senders.
3. A small trial using opted-in test numbers across Jio, Airtel, Vi and BSNL. Measure request acceptance separately from actual receipt, delivery latency, failure reporting and billing.
4. An authenticated callback contract, timeouts and safe reconciliation rules so an ambiguous timeout does not silently send repeated paid OTPs.
5. A server-only credential saved privately in `.env.local`, after the API is verified. Never install an unverified SDK or place the API secret in a client component.

CareNest should generate and verify OTPs in its backend, use hashed codes, keep the existing expiry/attempt limits, and distinguish sending from delivery. The SMS gateway only transports the approved template. Local demo codes do not verify real phone ownership.

## Sources

- [Provider's advertised A2P API and Node SDK](https://bulksmshub.com/a2p-sms-gateway)
- [Provider's India pricing claims](https://bulksmshub.com/sms-prices-india)
- [TRAI advice to senders: entity, header and template registration](https://www.trai.gov.in/advice-to-senders)
