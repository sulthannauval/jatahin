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
/** Special behaviour: deposits into / withdrawals from a savings pot. */
export const categoryRole = pgEnum("category_role", ["saving_deposit", "saving_withdraw"]);

const money = (name: string) => bigint(name, { mode: "number" });

export const categories = pgTable(
  "categories",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    kind: categoryKind("kind").notNull(),
    /** Expense: Wajib / Kebutuhan / Keinginan / Saving / Lainnya. Income: Rutin / Tidak Rutin / ... */
    group: text("group").notNull().default("Lainnya"),
    role: categoryRole("role"),
    sortOrder: integer("sort_order").notNull().default(0),
    archived: boolean("archived").notNull().default(false),
  },
  (t) => [uniqueIndex("categories_name_kind_idx").on(t.name, t.kind)],
);

/** Savings pots. A pot with a target is a goal. */
export const pots = pgTable("pots", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
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

export type Category = typeof categories.$inferSelect;
export type Pot = typeof pots.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
