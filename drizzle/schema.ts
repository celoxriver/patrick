import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  /** Discord-specific identity fields (set on Discord OAuth login). */
  discordId: varchar("discordId", { length: 32 }),
  discordUsername: varchar("discordUsername", { length: 64 }),
  discordAvatar: varchar("discordAvatar", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Stores the connection settings for the user's self-hosted bot bridge.
 * There is effectively one global bot (the Patrick bot), so we keep a single
 * settings row keyed by a fixed id. The dashboard talks to the bot through
 * this bridge URL using the shared secret.
 */
export const botSettings = mysqlTable("bot_settings", {
  id: int("id").autoincrement().primaryKey(),
  /** Public URL of the running bot bridge (e.g. a Cloudflare tunnel URL). */
  bridgeUrl: text("bridgeUrl"),
  /** Whether the bridge has been verified as reachable at least once. */
  lastConnectedAt: timestamp("lastConnectedAt"),
  updatedBy: varchar("updatedBy", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BotSettings = typeof botSettings.$inferSelect;
export type InsertBotSettings = typeof botSettings.$inferInsert;