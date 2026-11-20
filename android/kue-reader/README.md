# kue-reader (vendored)

Read-only NFC parsers for Indonesian prepaid cards (TapCash, Mandiri e-money, Flazz, Brizzi, JakCard, KMT), used by Cek E-Money.

- Source: https://github.com/muhakmal/osp-kue-reader, module `kue-reader`, tag `v1.0.0` (commit `894e46c959b6385d4a08bebe83d989a39e74c1a7`).
- License: Apache-2.0, see `LICENSE` and `NOTICE` (both copied unchanged).
- Changes: `NfcManager.kt` is left out (the app runs NFC reader mode itself), so the module needs no coroutines. The Gradle file is rewritten for this project. Changed sources, each marked "Changed for Jatahin":
  - `TapCashParser.kt`: upstream only read the purse after selecting AID `112233445566`, a placeholder that real cards reject. It now tries the selects, then reads the CEPAS purse (`90 32 03 00`) and its log either way, and decodes amounts as signed.
  - `CardParser.kt` and `ParserUtils.kt`: the outcome log carries the tag's ATQA, SAK and ATS and every APDU exchanged, for the app's raw data view. The card number in a CEPAS purse is masked.
- Tests: `src/test` runs JVM tests against fake cards (`./gradlew :kue-reader:testDebugUnitTest`).

The code is kept here, not pulled from JitPack, so every command sent to a card can be read in this repository. It only sends read commands (SELECT, READ BINARY, READ RECORD, balance and log reads); nothing writes to a card.
