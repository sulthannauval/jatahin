# kue-reader (vendored)

Read-only NFC parsers for Indonesian prepaid cards (TapCash, Mandiri e-money, Flazz, Brizzi, JakCard, KMT), used by Cek E-Money.

- Source: https://github.com/muhakmal/osp-kue-reader, module `kue-reader`, tag `v1.0.0` (commit `894e46c959b6385d4a08bebe83d989a39e74c1a7`).
- License: Apache-2.0, see `LICENSE` and `NOTICE` (both copied unchanged).
- Changes: `NfcManager.kt` is left out (the app runs NFC reader mode itself), so the module needs no coroutines. The Gradle file is rewritten for this project. The parser sources are unchanged.

The code is kept here, not pulled from JitPack, so every command sent to a card can be read in this repository. It only sends read commands (SELECT, READ BINARY, READ RECORD, balance and log reads); nothing writes to a card.
