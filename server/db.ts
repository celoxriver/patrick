import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, botSettings, InsertBotSettings } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ─── Discord auth helpers ──────────────────────────────────────────────────

export type DiscordUserUpsert = {
  openId: string;
  name: string | null;
  discordId: string;
  discordUsername: string | null;
  discordAvatar: string | null;
};

/** Insert or update a user authenticated via Discord OAuth. */
export async function upsertDiscordUser(input: DiscordUserUpsert): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert discord user: database not available");
    return;
  }

  const now = new Date();
  const isOwner = input.openId === ENV.ownerOpenId;
  await db
    .insert(users)
    .values({
      openId: input.openId,
      name: input.name,
      loginMethod: "discord",
      discordId: input.discordId,
      discordUsername: input.discordUsername,
      discordAvatar: input.discordAvatar,
      lastSignedIn: now,
      ...(isOwner ? { role: "admin" as const } : {}),
    })
    .onDuplicateKeyUpdate({
      set: {
        name: input.name,
        loginMethod: "discord",
        discordId: input.discordId,
        discordUsername: input.discordUsername,
        discordAvatar: input.discordAvatar,
        lastSignedIn: now,
      },
    });
}

// ─── Bot bridge settings helpers ───────────────────────────────────────────

/** There is a single global bot settings row. Returns it or null. */
export async function getBotSettings() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(botSettings).limit(1);
  return rows.length > 0 ? rows[0] : null;
}

/** Upsert the single global bot settings row (bridge URL). */
export async function saveBotSettings(input: { bridgeUrl: string; updatedBy: string; lastConnectedAt?: Date | null }): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await getBotSettings();
  if (existing) {
    await db
      .update(botSettings)
      .set({
        bridgeUrl: input.bridgeUrl,
        updatedBy: input.updatedBy,
        ...(input.lastConnectedAt !== undefined ? { lastConnectedAt: input.lastConnectedAt } : {}),
      })
      .where(eq(botSettings.id, existing.id));
  } else {
    const values: InsertBotSettings = {
      bridgeUrl: input.bridgeUrl,
      updatedBy: input.updatedBy,
      lastConnectedAt: input.lastConnectedAt ?? null,
    };
    await db.insert(botSettings).values(values);
  }
}

export async function markBridgeConnected(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await getBotSettings();
  if (existing) {
    await db.update(botSettings).set({ lastConnectedAt: new Date() }).where(eq(botSettings.id, existing.id));
  }
}
