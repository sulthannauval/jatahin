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
cp .env.example .env.local      # then fill in the three values below
npm run gen-secret              # → SESSION_SECRET
npm run hash-password           # → APP_PASSWORD_HASH (the password itself is never stored)
npm run dev                     # http://localhost:3000
```

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

## Security

- One account only (`APP_USER_EMAIL`). The password is stored as a scrypt hash in an environment variable, never in code.
- Sessions use a signed `HttpOnly`, `Secure`, `SameSite=Lax` cookie (`SESSION_SECRET`), valid for 30 days.
- After 5 failed sign-ins from one IP (or 30 in total) within 15 minutes, sign-in is temporarily locked.
- All data access happens on the server, and every page and action re-checks the session.
- `.env*` files, the local database and `.xlsx` files are never committed.

## Deployment plan

1. Connect this (private) repository to Vercel.
2. Add PostgreSQL (Neon from the Storage tab, or Supabase through its connection pooler) as `DATABASE_URL`.
3. Set fresh values for `APP_USER_EMAIL`, `APP_PASSWORD_HASH` and `SESSION_SECRET` (never reuse the local ones).
4. Deploy (migrations run during the build), sign in, then import the data from Settings.
