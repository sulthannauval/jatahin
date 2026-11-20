<div align="center">

<img src="public/icon.svg" alt="Jatahin!" width="88">

# Jatahin!

**Atur jatah, baru belanja.**

A personal finance app for one owner: monthly budgets, savings kept apart, recurring bills and a report that compares fairly. It replaces the "MoneyFlows" Google Sheets tracker it grew out of.

[jatahin-app.vercel.app](https://jatahin-app.vercel.app) · [Backup](#backup-and-restore) · [Deployment](#deployment)

</div>

> [!NOTE]
> A personal project built around one person's way of managing money. It is not a general-purpose product and is not designed for multiple users. The interface is in Indonesian. Feel free to borrow ideas.

## Features

| | |
| --- | --- |
| **Beranda** | Kantong Utama's balance, the part already held by unpaid tagihan until the next payday, and what is free to spend. One reminder banner for bills due. |
| **Catat transaksi** | One sheet for income and expenses. It suggests entries recorded at least twice in the last 90 days, offers past notes while typing and picks the category from the note. Holding the installed app's icon offers "Catat pengeluaran" and "Catat pemasukan". |
| **Transaksi** | Search, filters by category and month, and a table view that mirrors the old Daily Log sheet. Categories are managed from the filter and the record sheet. |
| **Jatah** | A monthly budget per category with what is left or over. Spending in categories without a jatah is shown apart and kept out of the remaining figure. |
| **Kantong** | Money kept apart from Kantong Utama, like bank pockets. Saving kantong have targets, funded one after another, with the monthly amount needed to reach each date. Spending kantong are paid from directly. Every kantong can be matched against the bank. |
| **Tagihan** | Bills paid every month, due on payday or on their own day. The amount follows the last payment, or the next one when it is set early. Recording the salary offers to pay the payday bills and the saving plan in one go. A new expense that clearly matches an open bill marks it paid, with an undo. |
| **Laporan** | Spending so far against the same days of last month, a day-by-day pace chart, where the money went (income, bills, daily spending, savings, left over), the categories that changed most and a six-month trend. |
| **Backup** | All data as one `.xlsx` file, downloaded on demand and emailed every week, and restored from the same page. |
| **Cek E-Money** | Android app only. Tap a prepaid card (TapCash, e-money, Flazz, Brizzi) on the phone to see its balance and the transactions stored on it. Read-only and on its own: nothing is saved and nothing else in the app changes. |

Light and dark themes, phone and desktop, installable as a PWA or as an [Android app](#android-app). Opening the app plays a short intro once per tab: a coin drops in, a J cuts the jatah out of it, and the logo lands in its place (skipped with reduced motion).

## Principles

- **Jatah and tabungan are separate.** Moving money into a kantong is never counted as spending or income, so a budget is never "used up" by saving.
- **Compare like with like.** Early in the month, the report compares 1–2 November with 1–2 Oktober, never a few days against a whole month.
- **Plain numbers.** Rupiah is always written in full (`Rp1.250.000`, never `1,25 jt`), and the app never estimates bank interest.
- **The spreadsheet's rules stay.** Each month's leftover becomes the next month's opening balance, and the old sheet can still be imported.
- **The data is the owner's.** Everything exports to a readable `.xlsx`, and a restore checks the whole file before changing anything.

## Architecture

```
phone / desktop (PWA) ──► Vercel, Next.js App Router (sin1)
                             │  server components read, server actions write
                             │  every page and action checks the session
                             ▼
                          Drizzle ORM ──► Neon Postgres (production)
                                      └─► PGlite in ./.data (local, no install)

Vercel Cron (Monday 06:00 WIB) ──► /api/cron/backup ──► .xlsx emailed via Resend

Android app (Capacitor) ──► loads the same production site
   └─ native: NFC card reading, in-app updates from the public releases repository
```

| Part | Role |
| --- | --- |
| [`src/app`](src/app) | Pages per section and the server actions that write data. |
| [`src/lib`](src/lib) | Money, dates, bills and report logic as plain functions, plus the queries behind each page. |
| [`src/lib/db/schema.ts`](src/lib/db/schema.ts) | The tables. Migrations live in [`drizzle`](drizzle) and run before every dev start and production build. |
| [`src/lib/backup`](src/lib/backup) | The `.xlsx` format, used by download, restore and the weekly email. |
| [`android`](android) | The Android shell, its two plugins (`EMoney`, `Updater`) and the vendored, read-only card reader in [`android/kue-reader`](android/kue-reader). |

**Stack:** Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Drizzle ORM · PostgreSQL / PGlite · Resend · Vitest · Capacitor 8

## Getting started

Requires Node 24. No PostgreSQL is needed locally: with `DATABASE_URL` empty, the app uses PGlite in `./.data/pglite`.

```bash
npm install
cp .env.example .env.local      # set APP_USER_EMAIL
npm run gen-secret              # paste the result as SESSION_SECRET
npm run dev                     # http://localhost:3000
```

Open `/daftar`, enter the owner email and follow the link to create a password. Without `RESEND_API_KEY`, the email and its link are printed in the terminal.

To bring in the old spreadsheet, upload it in **Pengaturan → Ekspor & impor**, or run `npm run import -- path/to/MoneyFlows.xlsx` (add `--replace` to overwrite existing data).

### Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Run migrations, then start the dev server |
| `npm test` | Run the tests, including a check that imported figures match the spreadsheet (skipped without `.local/MoneyFlows.xlsx`) |
| `npm run typecheck` | Generate route types and typecheck |
| `npm run lint` | Lint |
| `npm run build` | Run migrations, then build for production |
| `npm run db:generate` | Create a migration after changing the schema |
| `npm run reset-password` | Set a new password (and optionally email) from the terminal |

## Backup and restore

**Pengaturan → Ekspor & impor → Unduh .xlsx** downloads `jatahin-backup-YYYY-MM-DD.xlsx`, one sheet per table with the original IDs: transactions, moves between kantong, categories, kantong and their adjustments, jatah, saving plans, tagihan with the months paid or skipped, and settings. The account and sign-in records are left out.

- **Restore** from the same section. A restore replaces all finance data in one database transaction, so a file with a problem is rejected with its sheet, row and column, and nothing changes. Replacing existing data asks for the password first.
- **Readable anywhere.** The file opens in Excel or Google Sheets. Dates are `YYYY-MM-DD` text so they never shift between time zones, and the name columns beside each ID are only for reading.
- **Older backups** made before kantong (format version 1) still restore: their savings deposits and withdrawals become moves between kantong.
- **Weekly email.** A Vercel cron sends the same file to the login email every Monday between 06:00 and 07:00 WIB. `/api/cron/backup` only answers `Authorization: Bearer $CRON_SECRET`, and refuses everything when it is unset.

## Deployment

| Part | Host | Updates |
| --- | --- | --- |
| App | Vercel, region `sin1` | Every push to `main` |
| Database | Neon Postgres, Singapore (`aws-ap-southeast-1`), Production only | Migrations run in production builds; preview builds skip them, so an unmerged branch never changes the real data |
| Email | Resend (free plan) | Sign-in links, notices and the weekly backup |

1. Import the repository in Vercel and add Neon from the **Storage** tab. It sets `DATABASE_URL` (pooled, for the app) and `DATABASE_URL_UNPOOLED` (direct, for migrations).
2. For Production, set `APP_USER_EMAIL`, a fresh `SESSION_SECRET` (never the local one), `RESEND_API_KEY`, `APP_URL` and `CRON_SECRET` (`EMAIL_FROM` is optional).
3. Deploy, open `/daftar` to create the account, then restore a backup or import the old spreadsheet.

## Android app

The APK is a [Capacitor](https://capacitorjs.com) shell that opens the production site, so web changes reach the phone without a new release. A release is needed only when the native part changes: the NFC reader for Cek E-Money or the shell itself.

| | |
| --- | --- |
| **Install and update** | From [jatahin-releases](https://github.com/sulthannauval/jatahin-releases), a public repository holding only the APKs. On launch the app checks its latest release, downloads a newer APK, verifies its SHA-256 and opens Android's installer. |
| **Card reading** | [`android/kue-reader`](android/kue-reader) is [osp-kue-reader](https://github.com/muhakmal/osp-kue-reader) v1.0.0 (Apache-2.0), kept in the repository so every command sent to a card can be read. It only sends read commands. |
| **Pull requests** | Changes under `android/`, `capacitor-www/` or `capacitor.config.ts` build a debug APK, attached to the workflow run. |
| **Releases** | Pushing a tag `android-v1.2.3` builds the signed APK and publishes it as `v1.2.3`, with the tag message as release notes. |

The release workflow ([`.github/workflows/android.yml`](.github/workflows/android.yml)) reads five repository secrets, all created by the owner:

| Secret | What |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | The signing keystore, base64-encoded. Every release must use the same key, or Android refuses the update. Keep a copy outside GitHub. |
| `ANDROID_KEYSTORE_PASSWORD` | The keystore password. |
| `ANDROID_KEY_ALIAS` | The key's alias in the keystore. |
| `ANDROID_KEY_PASSWORD` | The key password. |
| `RELEASES_TOKEN` | A fine-grained token with *Contents: read and write* on `jatahin-releases` only. |

To build locally (needs JDK 21 and the Android SDK): `npx cap sync android`, then `./gradlew assembleDebug` in `android/`.

## Security

- **One account.** It is created at `/daftar`, only for `APP_USER_EMAIL` and confirmed by an email link. Once it exists, the page is closed.
- **Passwords** are stored as scrypt hashes.
- **Sessions** use a signed `HttpOnly`, `Secure`, `SameSite=Lax` cookie. A session ends after 7 days unused or 90 days after sign-in, and is renewed at most once a day while in use. Changing or resetting the password, or "Keluar dari semua perangkat", ends every other session at once.
- **Sign-in lockout** after 5 failed attempts from one IP, or 30 in total, within 15 minutes. Wrong passwords in account settings count too.
- **Email links** are random, single-use and expire in 30–60 minutes; only their hash is stored. "Lupa password?" gives the same reply for any address and sends at most 3 links per kind per 15 minutes.
- **Server only.** All data access happens on the server, and every page and action checks the session again.
- **Secrets** (`.env*`), the local database and `.xlsx` files are never committed.
- **Android app.** It only loads the production site; other sites open in the browser. Updates are downloaded only from the releases repository, checked against the release's SHA-256, and Android accepts them only when signed with the same key. App data is excluded from Android backups.

Locked out with no email? `npm run reset-password`, run against the same database, sets a new password, ends every session and clears the lockout.

## Contributing

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests and a production build on every pull request and every push to `main`. It needs no secrets: the build migrates a throwaway PGlite database. Android changes also build a debug APK (`.github/workflows/android.yml`). Pull requests are squash-merged into `main`.
