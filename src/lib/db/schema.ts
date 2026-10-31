import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const categoryKind = pgEnum("category_kind", ["income", "expense"]);
/** A kantong for saving (may have a target) or for spending from directly (e.g. a monthly food kantong). */
export const potKind = pgEnum("pot_kind", ["saving", "spending"]);

const money = (name: string) => bigint(name, { mode: "number" });

export const categories = pgTable(
  "categories",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    kind: categoryKind("kind").notNull(),
    /** Expense: Wajib / Kebutuhan / Keinginan / Saving / Lainnya. Income: Rutin / Tidak Rutin / ... */
    group: text("group").notNull().default("Lainnya"),
    sortOrder: integer("sort_order").notNull().default(0),
    archived: boolean("archived").notNull().default(false),
  },
  (t) => [uniqueIndex("categories_name_kind_idx").on(t.name, t.kind)],
);

/**
 * Kantong: money kept apart from the main kantong (Kantong Utama, which has no row and is `null` everywhere).
 * A saving kantong with a target is a goal.
 */
export const pots = pgTable("pots", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  kind: potKind("kind").notNull().default("saving"),
  note: text("note").notNull().default(""),
  target: money("target"),
  targetDate: date("target_date"),
  /** Goals are worked on one after another, lowest priority number first. */
  priority: integer("priority"),
  /** Starting balance, counted as of openingDate. Only transactions after it are added. */
  openingBalance: money("opening_balance").notNull().default(0),
  openingDate: date("opening_date"),
  sortOrder: integer("sort_order").notNull().default(0),
  archived: boolean("archived").notNull().default(false),
});

export const transactions = pgTable(
  "transactions",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    /** The kantong the money left (expense) or arrived in (income). Null: Kantong Utama. */
    potId: integer("pot_id").references(() => pots.id, { onDelete: "restrict" }),
    description: text("description").notNull().default(""),
    amount: money("amount").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("transactions_date_idx").on(t.date),
    index("transactions_category_idx").on(t.categoryId),
    check("transactions_amount_positive", sql`${t.amount} > 0`),
  ],
);

/**
 * Money moved between two kantong. Null on either side is Kantong Utama. Never counted as income or spending.
 */
export const transfers = pgTable(
  "transfers",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    fromPotId: integer("from_pot_id").references(() => pots.id, { onDelete: "restrict" }),
    toPotId: integer("to_pot_id").references(() => pots.id, { onDelete: "restrict" }),
    amount: money("amount").notNull(),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("transfers_date_idx").on(t.date),
    check("transfers_amount_positive", sql`${t.amount} > 0`),
    check("transfers_two_kantong", sql`${t.fromPotId} is distinct from ${t.toPotId}`),
  ],
);

/**
 * A correction to a pot's balance that isn't money moving from or to the wallet: a mismatch found when
 * matching against the bank. Never counted as income or spending.
 */
export const potAdjustments = pgTable(
  "pot_adjustments",
  {
    id: serial("id").primaryKey(),
    potId: integer("pot_id")
      .notNull()
      .references(() => pots.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    /** Signed: positive adds to the pot. */
    amount: money("amount").notNull(),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pot_adjustments_pot_idx").on(t.potId), check("pot_adjustments_nonzero", sql`${t.amount} <> 0`)],
);

/** Budget per expense category per month. month = first day of the month. */
export const budgets = pgTable(
  "budgets",
  {
    month: date("month").notNull(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    amount: money("amount").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.month, t.categoryId] }),
    check("budgets_amount_nonneg", sql`${t.amount} >= 0`),
  ],
);

/** How much is meant to go into saving kantong in a month. month = first day of the month. */
export const savingPlans = pgTable(
  "saving_plans",
  {
    month: date("month").primaryKey(),
    amount: money("amount").notNull(),
  },
  (t) => [check("saving_plans_amount_nonneg", sql`${t.amount} >= 0`)],
);

/** Single-row settings table (id = 1). */
export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  /** Month from which leftover balance carries into the next month. */
  carryStartMonth: text("carry_start_month"), // "YYYY-MM"
  carryStartBalance: money("carry_start_balance").notNull().default(0),
}, (t) => [check("settings_single_row", sql`${t.id} = 1`)]);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: serial("id").primaryKey(),
    ip: text("ip").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("login_attempts_ip_idx").on(t.ip, t.createdAt)],
);

/**
 * The one account (id = 1), created at /daftar by the owner (APP_USER_EMAIL) through an email link.
 * Raising sessionVersion invalidates every session token issued before it.
 */
export const account = pgTable(
  "account",
  {
    id: integer("id").primaryKey().default(1),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    sessionVersion: integer("session_version").notNull().default(1),
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    lastLoginIp: text("last_login_ip"),
  },
  (t) => [check("account_single_row", sql`${t.id} = 1`)],
);

export const authTokenPurpose = pgEnum("auth_token_purpose", ["setup", "reset", "email_change"]);

/**
 * One-time links sent by email: creating the account, resetting the password, confirming a new email.
 * Only a SHA-256 hash of the link's token is stored. `email` is where the link was sent (the new address for email_change).
 */
export const authTokens = pgTable(
  "auth_tokens",
  {
    id: serial("id").primaryKey(),
    purpose: authTokenPurpose("purpose").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    email: text("email").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auth_tokens_purpose_idx").on(t.purpose, t.createdAt)],
);

export type Category = typeof categories.$inferSelect;
export type Pot = typeof pots.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Transfer = typeof transfers.$inferSelect;
