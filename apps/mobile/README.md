# CareNest local native patient app

This is a native Expo implementation, not a published mobile product. The website remains the full clinic/partner interface. This patient app pairs with a signed-in website account, reads real appointments/pets/records and submits encrypted appointment/cancellation intents. A pending intent is never shown as a confirmed booking.

Install with `npm ci` in this directory. Run `npm run typecheck`. Use a **native development build**, since SQLCipher is not available in Expo Go. The runtime checks `PRAGMA cipher_version` and refuses an unencrypted offline queue. Native tokens and the encryption key use SecureStore; signed records are cached only after explicit device opt-in, in SQLCipher, for at most 24 hours and no longer than the device session. Offline intents expire after 24 hours, are capped at 20, and require current ownership, consent, reservation and revision checks when synced.

On Windows, install the Android SDK/JDK and run `npm run android`. Use an emulator, and set `CARENEST_MOBILE_LOCAL=1` and `CARENEST_MOBILE_API_ORIGIN=http://10.0.2.2:3000` before the build. The website stays bound to loopback. For USB Android use `adb reverse tcp:3000 tcp:3000` and `http://127.0.0.1:3000`. Local HTTP is compiled in only for explicit local builds. Release builds require HTTPS and real phone verification. No EAS/cloud build is configured.

iOS compilation requires a Mac, Xcode and signing details; it cannot be executed on this Windows machine. App-store publishing, biometric/device integrity and real-device accessibility/performance tests remain separate work. The app identifier is explicitly a local development identifier, not an invented registered-company identity.

Revoke a device from `/account/mobile`. Server access expires after seven days. Revoked/expired sessions clear the queue when the client next connects; remote erasure cannot reach an offline device. Sign out to clear local data immediately. Closing/backgrounding hides record data held in memory. Refresh online or explicitly load a valid opted-in encrypted copy. Cached prescriptions and appointment status may have changed; verify online before acting. Disabling offline records removes the cached snapshot.

Official references: [Expo SQLCipher configuration](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/), [SecureStore](https://docs.expo.dev/versions/v57.0.0/sdk/securestore/), [local native builds](https://docs.expo.dev/guides/local-app-development/).
