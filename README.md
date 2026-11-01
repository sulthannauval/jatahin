# Jatahin!

_Atur Jatah, Baru Belanja._ ("Set the budget, then spend.")

A personal finance app I built for my own needs. It is **not a general-purpose product**: the flows, categories and calculations follow the way I manage my money, and it replaces my old Google Sheets tracker ("MoneyFlows").

This repository is mainly an archive and a personal reference. Feel free to borrow ideas, but the app is not designed for multiple users. The interface is in Indonesian.

## What it does

- **Daily transactions**: income and expenses by category, with search, filters and a table view that mirrors the old Daily Log sheet.
- **Quick entry**: the installed app's icon offers "Catat pengeluaran" and "Catat pemasukan" when held down. The form suggests entries recorded at least twice in the last 90 days (with the latest amount), offers past notes while typing, and picks the category from the note.
- **Monthly budget**: remaining or over-budget amounts per category. Spending in categories without a budget is shown separately and kept out of the remaining-budget figure.
- **Kantong**: money kept apart from Kantong Utama, like bank pockets. Saving kantong can have targets, funded one after another, with the monthly amount needed to reach each target date; spending kantong are paid from directly. Moving money between kantong is never counted as income or spending, and every kantong can be matched against the bank.
- **Tagihan**: what is paid every month (electricity, BPJS, subscriptions), under Transaksi. Each is due on payday or on its own day of the month, and its amount follows the last payment. Dated ones are reminded on Beranda from the day before until paid or skipped; payday ones are recorded together with the salary and the month's saving plan in one sheet. A new expense that clearly matches an open tagihan marks it paid (with an undo), and any transaction can be picked as the payment by hand.
- **Report**: monthly summary, the expense categories that changed most against last month, spending breakdown by type, and a six-month trend.
- **Carry-over balance**: each month's leftover becomes the next month's opening balance, like in the old spreadsheet.
- **Backup**: download all data as one `.xlsx` file and restore it later from the same page.

Single user, single account. Light and dark themes, works on desktop and mobile.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Drizzle ORM · PostgreSQL (PGlite for local development) · Vitest.

## Running locally

```bash
npm install
cp .env.example .env.local      # set APP_USER_EMAIL, then:
npm run gen-secret              # → SESSION_SECRET
npm run dev                     # http://localhost:3000
```

Then open `/daftar`, enter the owner email and follow the link to create a password. Locally, without `RESEND_API_KEY`, the email (with its link) is printed in the terminal.

With `DATABASE_URL` left empty, the app uses a local embedded database (PGlite) in `./.data/pglite`, so no PostgreSQL install is needed.

Importing data from the old spreadsheet (either works):

- In the app: **Pengaturan → Ekspor & impor**, then upload the `.xlsx` export.
- From the terminal: `npm run import -- path/to/MoneyFlows.xlsx` (add `--replace` to overwrite existing data).

## Backup and restore

**Pengaturan → Ekspor & impor → Unduh .xlsx** downloads `jatahin-backup-YYYY-MM-DD.xlsx`. It holds every transaction, move between kantong, category, kantong, kantong adjustment, budget, saving plan, tagihan with the months it was paid or skipped, and setting, one sheet per table, with the original IDs. Backups made before kantong (format version 1) can still be restored: their savings deposits and withdrawals become moves between kantong. The account (email and password hash) and sign-in records are left out.

To restore, upload the file in the same section. The app tells a backup apart from the old MoneyFlows spreadsheet by its `Info` sheet. A restore replaces all finance data in one database transaction, so a file with a problem (for example an `ID kategori` that doesn't exist) is rejected with the sheet, row and column, and the current data stays as it was. Replacing existing data asks for the current password first.

The file opens in Excel or Google Sheets. Dates are stored as `YYYY-MM-DD` text so they can't shift between time zones. The name columns next to each ID are only there to make the file readable; a restore uses the IDs.

On Vercel, a cron job (`vercel.json`) emails the same file to the login email every Monday between 06:00 and 07:00 Jakarta time (Sunday 23:00 UTC). It calls `/api/cron/backup`, which only answers requests carrying `Authorization: Bearer $CRON_SECRET`; without `CRON_SECRET` it refuses everything. A failed send shows up as a 500 in the Vercel logs.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Run locally (database migrations run first) |
| `npm test` | Run tests, including a check that imported figures match the spreadsheet (needs `.local/MoneyFlows.xlsx`) |
| `npm run build` | Run migrations, then build for production |
| `npm run db:generate` | Create a migration after changing `src/lib/db/schema.ts` |
| `npm run reset-password` | Set a new password from the terminal if it is forgotten |

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs lint, typecheck, tests and the production build on every pull request and on every push to `main`. It needs no secrets: the build migrates a throwaway PGlite database, and the spreadsheet test skips itself when `.local/MoneyFlows.xlsx` is missing.

## Security

- One account only. It is created at `/daftar`, and only for the owner's address (`APP_USER_EMAIL`), confirmed by an email link. Once it exists, the page is closed.
- Passwords are stored as scrypt hashes, never in plain text.
- Sessions use a signed `HttpOnly`, `Secure`, `SameSite=Lax` cookie (`SESSION_SECRET`). A session ends after 7 days without opening the app and 90 days after signing in, whichever comes first; while the app is in use, the cookie is renewed at most once a day. Each session carries a version number, so changing or resetting the password, or choosing "sign out everywhere", ends sessions on other devices right away.
- After 5 failed attempts from one IP (or 30 in total) within 15 minutes, sign-in is temporarily locked. Wrong passwords entered in account settings count too.
- Email links (setup, reset, new email) are random, single-use and short-lived (30–60 minutes); only their hash is stored. The forgotten-password form gives the same reply for any address, and at most 3 links per kind are sent per 15 minutes.
- All data access happens on the server, and every page and action re-checks the session.
- `.env*` files, the local database and `.xlsx` files are never committed.

## Account

**Pengaturan → Akun**:

- Change the login email. A confirmation link goes to the new address, and the change applies once it is opened.
- Change the password. Other devices are signed out and a notice is emailed.
- See the last sign-in and recent failed attempts, and sign out of every device.

**Forgot the password?** Use "Lupa password?" on the sign-in page. Email is sent with [Resend](https://resend.com) (free plan: 100 emails a day). Without your own domain in Resend, emails can only go to the address of your Resend account, which is fine for a single owner.

If email isn't available, run this from the project folder with the same database connection as the app:

```bash
npm run reset-password
```

It sets a new password (and optionally a new email), ends every session and clears the sign-in lockout.

## Deployment

Vercel with a Neon Postgres database, both in Singapore (`vercel.json` sets the function region to `sin1`).

1. Import this (private) repository in Vercel.
2. Add Neon from the project's **Storage** tab, in the Singapore region (`aws-ap-southeast-1`), connected to the **Production** environment only. It sets `DATABASE_URL` (pooled, used by the app) and `DATABASE_URL_UNPOOLED` (direct, used for migrations).
3. Set `APP_USER_EMAIL`, a fresh `SESSION_SECRET` (never reuse the local one), `RESEND_API_KEY` and `CRON_SECRET` (generate it with `npm run gen-secret`) for Production.
4. Deploy. Production builds run the migrations first. Preview builds skip them, so an unmerged branch never changes the real database.
5. Open `/daftar` to create the account, then restore a backup file (or import the old spreadsheet) from Settings.
