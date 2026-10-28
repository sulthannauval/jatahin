# Jatahin!

_Atur Jatah, Baru Belanja._ ("Set the budget, then spend.")

A personal finance app I built for my own needs. It is **not a general-purpose product**: the flows, categories and calculations follow the way I manage my money, and it replaces my old Google Sheets tracker ("MoneyFlows").

This repository is mainly an archive and a personal reference. Feel free to borrow ideas, but the app is not designed for multiple users. The interface is in Indonesian.

## What it does

- **Daily transactions**: income and expenses by category, with search, filters and a table view that mirrors the old Daily Log sheet.
- **Monthly budget**: remaining or over-budget amounts per category. Spending in categories without a budget is shown separately and kept out of the remaining-budget figure.
- **Savings and goals**: balance per savings pot, goals funded one after another, the monthly amount needed to reach each target date, and matching pot balances against the bank.
- **Report**: monthly summary, automatic highlights, spending breakdown by type, and a six-month trend.
- **Carry-over balance**: each month's leftover becomes the next month's opening balance, like in the old spreadsheet.

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

- In the app: **Pengaturan → Impor dari Excel**, then upload the `.xlsx` export.
- From the terminal: `npm run import -- path/to/MoneyFlows.xlsx` (add `--replace` to overwrite existing data).

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Run locally (database migrations run first) |
| `npm test` | Run tests, including a check that imported figures match the spreadsheet (needs `.local/MoneyFlows.xlsx`) |
| `npm run build` | Run migrations, then build for production |
| `npm run db:generate` | Create a migration after changing `src/lib/db/schema.ts` |
| `npm run reset-password` | Set a new password from the terminal if it is forgotten |

## Security

- One account only. It is created at `/daftar`, and only for the owner's address (`APP_USER_EMAIL`), confirmed by an email link. Once it exists, the page is closed.
- Passwords are stored as scrypt hashes, never in plain text.
- Sessions use a signed `HttpOnly`, `Secure`, `SameSite=Lax` cookie (`SESSION_SECRET`), valid for 30 days. Each session carries a version number, so changing or resetting the password, or choosing "sign out everywhere", ends sessions on other devices right away.
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

## Deployment plan

1. Connect this (private) repository to Vercel.
2. Add PostgreSQL (Neon from the Storage tab, or Supabase through its connection pooler) as `DATABASE_URL`.
3. Set `APP_USER_EMAIL`, a fresh `SESSION_SECRET` (never reuse the local one) and `RESEND_API_KEY`.
4. Deploy (migrations run during the build), open `/daftar` to create the account, then import the data from Settings.
