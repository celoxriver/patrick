// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

// server/db.ts
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// drizzle/schema.ts
import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
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
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var botSettings = mysqlTable("bot_settings", {
  id: int("id").autoincrement().primaryKey(),
  /** Public URL of the running bot bridge (e.g. a Cloudflare tunnel URL). */
  bridgeUrl: text("bridgeUrl"),
  /** Whether the bridge has been verified as reachable at least once. */
  lastConnectedAt: timestamp("lastConnectedAt"),
  updatedBy: varchar("updatedBy", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  discordClientId: process.env.DISCORD_CLIENT_ID ?? "",
  discordClientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
  discordBotToken: process.env.DISCORD_BOT_TOKEN ?? "",
  bridgeSharedSecret: process.env.BRIDGE_SHARED_SECRET ?? ""
};
function isOwner(input) {
  const owner = (ENV.ownerOpenId ?? "").trim();
  if (!owner) return false;
  const ownerNorm = owner.replace(/^discord_/, "");
  const candidates = [input.openId, input.discordId].filter((v) => typeof v === "string" && v.length > 0).map((v) => v.replace(/^discord_/, ""));
  return candidates.some((c) => c === ownerNorm);
}
function buildBotInviteUrl(guildId) {
  const params = new URLSearchParams({
    client_id: ENV.discordClientId,
    permissions: "8",
    scope: "bot applications.commands"
  });
  if (guildId) {
    params.set("guild_id", guildId);
    params.set("disable_guild_select", "true");
  }
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

// server/db.ts
var _db = null;
async function getDb() {
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
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function upsertDiscordUser(input) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert discord user: database not available");
    return;
  }
  const now = /* @__PURE__ */ new Date();
  const isOwner2 = input.openId === ENV.ownerOpenId;
  await db.insert(users).values({
    openId: input.openId,
    name: input.name,
    loginMethod: "discord",
    discordId: input.discordId,
    discordUsername: input.discordUsername,
    discordAvatar: input.discordAvatar,
    lastSignedIn: now,
    ...isOwner2 ? { role: "admin" } : {}
  }).onDuplicateKeyUpdate({
    set: {
      name: input.name,
      loginMethod: "discord",
      discordId: input.discordId,
      discordUsername: input.discordUsername,
      discordAvatar: input.discordAvatar,
      lastSignedIn: now
    }
  });
}
async function getBotSettings() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(botSettings).limit(1);
  return rows.length > 0 ? rows[0] : null;
}
async function saveBotSettings(input) {
  const db = await getDb();
  if (!db) return;
  const existing = await getBotSettings();
  if (existing) {
    await db.update(botSettings).set({
      bridgeUrl: input.bridgeUrl,
      updatedBy: input.updatedBy,
      ...input.lastConnectedAt !== void 0 ? { lastConnectedAt: input.lastConnectedAt } : {}
    }).where(eq(botSettings.id, existing.id));
  } else {
    const values = {
      bridgeUrl: input.bridgeUrl,
      updatedBy: input.updatedBy,
      lastConnectedAt: input.lastConnectedAt ?? null
    };
    await db.insert(botSettings).values(values);
  }
}

// server/_core/cookies.ts
var LOCAL_HOSTS = /* @__PURE__ */ new Set(["localhost", "127.0.0.1", "::1"]);
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  const isLocal = LOCAL_HOSTS.has(req.hostname);
  return {
    httpOnly: true,
    path: "/",
    sameSite: isLocal ? "lax" : "none",
    secure: isLocal ? false : isSecureRequest(req)
  };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    const redirectUri = atob(state);
    return redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app) {
  app.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/_core/discordAuth.ts
import { SignJWT as SignJWT2 } from "jose";
var DISCORD_API = "https://discord.com/api/v10";
var SCOPES = ["identify", "guilds"];
function sessionSecret() {
  return new TextEncoder().encode(ENV.cookieSecret);
}
async function signDiscordSession(claims, expiresInMs) {
  const expSeconds = Math.floor((Date.now() + expiresInMs) / 1e3);
  return new SignJWT2({ ...claims }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expSeconds).sign(sessionSecret());
}
function getQueryParam2(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function buildAuthorizeUrl(redirectUri, state) {
  const url = new URL(`${DISCORD_API}/oauth2/authorize`);
  url.searchParams.set("client_id", ENV.discordClientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "consent");
  return url.toString();
}
function registerDiscordAuthRoutes(app) {
  app.get("/api/discord/login", (req, res) => {
    const origin = getQueryParam2(req, "origin") || `${req.protocol}://${req.get("host")}`;
    const redirectUri = `${origin}/api/discord/callback`;
    const state = Buffer.from(JSON.stringify({ origin })).toString("base64url");
    res.redirect(302, buildAuthorizeUrl(redirectUri, state));
  });
  app.get("/api/discord/callback", async (req, res) => {
    const code = getQueryParam2(req, "code");
    const state = getQueryParam2(req, "state");
    if (!code || !state) {
      res.status(400).send("Eksik parametre: code/state");
      return;
    }
    let origin;
    try {
      const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
      origin = decoded.origin;
      if (typeof origin !== "string") throw new Error("origin yok");
    } catch {
      res.status(400).send("Ge\xE7ersiz state");
      return;
    }
    const redirectUri = `${origin}/api/discord/callback`;
    try {
      const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: ENV.discordClientId,
          client_secret: ENV.discordClientSecret,
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri
        })
      });
      if (!tokenRes.ok) {
        const text2 = await tokenRes.text();
        console.error("[DiscordOAuth] token exchange failed", tokenRes.status, text2);
        res.redirect(302, `${origin}/?error=token`);
        return;
      }
      const token = await tokenRes.json();
      const userRes = await fetch(`${DISCORD_API}/users/@me`, {
        headers: { Authorization: `Bearer ${token.access_token}` }
      });
      if (!userRes.ok) {
        console.error("[DiscordOAuth] user fetch failed", userRes.status);
        res.redirect(302, `${origin}/?error=user`);
        return;
      }
      const discordUser = await userRes.json();
      const openId = `discord_${discordUser.id}`;
      const displayName = discordUser.global_name || discordUser.username;
      await upsertDiscordUser({
        openId,
        name: displayName,
        discordId: discordUser.id,
        discordUsername: discordUser.username,
        discordAvatar: discordUser.avatar
      });
      const sessionMs = Math.min(
        ONE_YEAR_MS,
        Math.max(6e4, (token.expires_in - 60) * 1e3)
      );
      const sessionToken = await signDiscordSession(
        {
          openId,
          appId: ENV.appId || "discord",
          name: displayName,
          discordId: discordUser.id,
          discordUsername: discordUser.username,
          discordAvatar: discordUser.avatar,
          discordAccessToken: token.access_token
        },
        sessionMs
      );
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: sessionMs });
      res.redirect(302, `${origin}/dashboard`);
    } catch (error) {
      console.error("[DiscordOAuth] callback error", error);
      res.redirect(302, `${origin}/?error=server`);
    }
  });
}

// server/_core/storageProxy.ts
function registerStorageProxy(app) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = req.params[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }
    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
      );
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` }
      });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = await forgeResp.json();
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers/discord.ts
import { TRPCError as TRPCError4 } from "@trpc/server";
import { z as z2 } from "zod";

// server/_core/botBridge.ts
import { TRPCError as TRPCError3 } from "@trpc/server";
var LOCAL_BRIDGE_URL = process.env.BOT_BRIDGE_URL || "http://localhost:8787";
async function getBridgeUrl() {
  if (process.env.BOT_BRIDGE_URL) {
    return process.env.BOT_BRIDGE_URL.replace(/\/+$/, "");
  }
  const settings = await getBotSettings();
  const url = settings?.bridgeUrl?.trim();
  if (!url) {
    throw new TRPCError3({
      code: "PRECONDITION_FAILED",
      message: "Bot ba\u011Flant\u0131s\u0131 ayarlanmam\u0131\u015F."
    });
  }
  return url.replace(/\/+$/, "");
}
async function bridgeRequest(opts) {
  const base = (opts.baseUrl ?? await getBridgeUrl()).replace(/\/+$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 12e3);
  try {
    const res = await fetch(`${base}${opts.path}`, {
      method: opts.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        "x-bridge-secret": ENV.bridgeSharedSecret
      },
      body: opts.body !== void 0 ? JSON.stringify(opts.body) : void 0,
      signal: controller.signal
    });
    const text2 = await res.text();
    let parsed = null;
    try {
      parsed = text2 ? JSON.parse(text2) : null;
    } catch {
      parsed = { raw: text2 };
    }
    if (!res.ok) {
      const msg = parsed?.error || parsed?.message || `Bot k\xF6pr\xFCs\xFC hata d\xF6nd\xFCrd\xFC (${res.status})`;
      throw new TRPCError3({
        code: res.status === 401 ? "UNAUTHORIZED" : "BAD_REQUEST",
        message: msg
      });
    }
    return parsed;
  } catch (err) {
    if (err instanceof TRPCError3) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new TRPCError3({
        code: "TIMEOUT",
        message: "Bota ula\u015F\u0131lamad\u0131 (zaman a\u015F\u0131m\u0131). Botun \xE7al\u0131\u015Ft\u0131\u011F\u0131ndan ve k\xF6pr\xFC adresinin do\u011Fru oldu\u011Fundan emin olun."
      });
    }
    throw new TRPCError3({
      code: "INTERNAL_SERVER_ERROR",
      message: "Bota ba\u011Flan\u0131lamad\u0131. Botun \xE7al\u0131\u015Ft\u0131\u011F\u0131ndan ve k\xF6pr\xFC adresinin do\u011Fru oldu\u011Fundan emin olun."
    });
  }
}
async function pingBridge(baseUrl) {
  return bridgeRequest({
    method: "GET",
    path: "/health",
    baseUrl,
    timeoutMs: 1e4
  });
}
async function getGuildDetail(guildId) {
  return bridgeRequest({ method: "GET", path: `/guilds/${guildId}` });
}
async function getInstalledGuildIds() {
  try {
    const res = await bridgeRequest({
      method: "GET",
      path: `/installed-guilds`,
      timeoutMs: 8e3
    });
    return Array.isArray(res?.guildIds) ? res.guildIds : [];
  } catch {
    return [];
  }
}
async function getSystemStatus(guildId) {
  return bridgeRequest({ method: "GET", path: `/systems/${guildId}` });
}
async function getTalepLoglari(guildId) {
  const res = await bridgeRequest({
    method: "GET",
    path: `/destek/loglar/${guildId}`
  });
  return Array.isArray(res?.loglar) ? res.loglar : [];
}
async function getTalepLog(guildId, talepId) {
  return bridgeRequest({
    method: "GET",
    path: `/destek/log/${guildId}/${encodeURIComponent(talepId)}`
  });
}
async function setupDestek(input) {
  return bridgeRequest({ method: "POST", path: `/destek/setup`, body: input });
}
async function deleteDestek(guildId) {
  return bridgeRequest({ method: "POST", path: `/destek/delete`, body: { guildId } });
}
async function setupKulup(input) {
  return bridgeRequest({ method: "POST", path: `/kulup/setup`, body: input });
}
async function deleteKulup(guildId) {
  return bridgeRequest({ method: "POST", path: `/kulup/delete`, body: { guildId } });
}
async function getAllGuilds() {
  try {
    const res = await bridgeRequest({
      method: "GET",
      path: "/all-guilds",
      timeoutMs: 1e4
    });
    return Array.isArray(res?.guilds) ? res.guilds : [];
  } catch {
    return [];
  }
}
async function leaveGuild(guildId) {
  return bridgeRequest({ method: "POST", path: "/leave-guild", body: { guildId } });
}
async function updateDestekRole(guildId, rolId) {
  return bridgeRequest({ method: "POST", path: "/destek/update-role", body: { guildId, rolId } });
}
async function updateKulupMetinKanal(guildId, metinKanalId) {
  return bridgeRequest({ method: "POST", path: "/kulup/update-metin-kanal", body: { guildId, metinKanalId } });
}
async function getGeli\u015Ftiriciler() {
  try {
    const res = await bridgeRequest({
      method: "GET",
      path: "/geli\u015Ftiriciler",
      timeoutMs: 8e3
    });
    return {
      geli\u015Ftiriciler: Array.isArray(res?.geli\u015Ftiriciler) ? res.geli\u015Ftiriciler : [],
      botOwnerId: res?.botOwnerId ?? ""
    };
  } catch {
    return { geli\u015Ftiriciler: [], botOwnerId: "" };
  }
}
async function addGeli\u015Ftirici(discordId) {
  return bridgeRequest({ method: "POST", path: "/geli\u015Ftiriciler/ekle", body: { discordId } });
}
async function removeGeli\u015Ftirici(discordId) {
  return bridgeRequest({ method: "POST", path: "/geli\u015Ftiriciler/sil", body: { discordId } });
}

// server/_core/discordSession.ts
import { parse as parseCookieHeader2 } from "cookie";
import { jwtVerify as jwtVerify2 } from "jose";
function sessionSecret2() {
  return new TextEncoder().encode(ENV.cookieSecret);
}
function readToken(req) {
  const cookies = parseCookieHeader2(req.headers.cookie ?? "");
  let token = cookies[COOKIE_NAME];
  if (!token) {
    const authHeader = req.headers.authorization;
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    }
  }
  return token;
}
async function getDiscordSession(req) {
  const token = readToken(req);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify2(token, sessionSecret2(), { algorithms: ["HS256"] });
    const p = payload;
    if (typeof p.discordId !== "string" || typeof p.discordAccessToken !== "string") {
      return null;
    }
    return {
      openId: String(p.openId ?? ""),
      discordId: p.discordId,
      discordUsername: String(p.discordUsername ?? ""),
      discordAvatar: p.discordAvatar ?? null,
      name: String(p.name ?? ""),
      discordAccessToken: p.discordAccessToken
    };
  } catch {
    return null;
  }
}
var DISCORD_API2 = "https://discord.com/api/v10";
var PERM_ADMINISTRATOR = BigInt(8);
var PERM_MANAGE_GUILD = BigInt(32);
var guildCache = /* @__PURE__ */ new Map();
var inFlight = /* @__PURE__ */ new Map();
var CACHE_TTL_MS = 6e4;
function cacheKey(accessToken) {
  return accessToken.slice(-32);
}
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function fetchGuildsRaw(accessToken) {
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(`${DISCORD_API2}/users/@me/guilds`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (res.status === 429) {
      let retryAfterSec = 1;
      const headerRetry = res.headers.get("retry-after");
      try {
        const body = await res.clone().json();
        if (typeof body.retry_after === "number") retryAfterSec = body.retry_after;
      } catch {
        if (headerRetry) retryAfterSec = Number(headerRetry) || retryAfterSec;
      }
      if (attempt < MAX_RETRIES) {
        await sleep(Math.ceil(retryAfterSec * 1e3) + 250);
        continue;
      }
      throw new Error(
        "Discord sunucu listesi \u015Fu an \xE7ok s\u0131k istendi (h\u0131z s\u0131n\u0131r\u0131). L\xFCtfen birka\xE7 saniye sonra tekrar deneyin."
      );
    }
    if (!res.ok) {
      const text2 = await res.text();
      throw new Error(`Discord guild listesi al\u0131namad\u0131 (${res.status}): ${text2}`);
    }
    const guilds = await res.json();
    return guilds.filter((g) => {
      if (g.owner) return true;
      try {
        const perms = BigInt(g.permissions);
        return (perms & PERM_ADMINISTRATOR) === PERM_ADMINISTRATOR || (perms & PERM_MANAGE_GUILD) === PERM_MANAGE_GUILD;
      } catch {
        return false;
      }
    }).map((g) => ({ id: g.id, name: g.name, icon: g.icon, owner: g.owner }));
  }
  throw new Error("Discord guild listesi al\u0131namad\u0131.");
}
async function fetchManageableGuilds(accessToken, force = false) {
  const key = cacheKey(accessToken);
  if (!force) {
    const cached = guildCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.guilds;
    }
  }
  const existing = inFlight.get(key);
  if (existing) return existing;
  const promise = fetchGuildsRaw(accessToken).then((guilds) => {
    guildCache.set(key, { guilds, expiresAt: Date.now() + CACHE_TTL_MS });
    return guilds;
  }).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}

// server/routers/discord.ts
async function requireDiscord(ctx) {
  const session = await getDiscordSession(ctx.req);
  if (!session) {
    throw new TRPCError4({ code: "UNAUTHORIZED", message: "L\xFCtfen Discord ile giri\u015F yap\u0131n." });
  }
  return session;
}
async function requireOwner(ctx) {
  const session = await requireDiscord(ctx);
  if (!isOwner({ openId: session.openId, discordId: session.discordId })) {
    throw new TRPCError4({
      code: "FORBIDDEN",
      message: "Bu sayfa yaln\u0131zca panel sahibine a\xE7\u0131kt\u0131r."
    });
  }
  return session;
}
var guildIdSchema = z2.object({ guildId: z2.string().min(1) });
var discordRouter = router({
  // Giriş yapmış Discord kullanıcısı
  // Genel bot davet URL'si (giriş gerektirmez)
  botInviteUrl: publicProcedure.query(() => {
    return { url: buildBotInviteUrl() };
  }),
  me: publicProcedure.query(async ({ ctx }) => {
    const session = await getDiscordSession(ctx.req);
    if (!session) return null;
    return {
      discordId: session.discordId,
      username: session.discordUsername,
      name: session.name,
      avatar: session.discordAvatar,
      avatarUrl: session.discordAvatar ? `https://cdn.discordapp.com/avatars/${session.discordId}/${session.discordAvatar}.png?size=128` : null,
      // Panel sahibi mi? Bot Ayarları gibi sahibe özel alanlar bununla gizlenir.
      isOwner: isOwner({ openId: session.openId, discordId: session.discordId })
    };
  }),
  logout: publicProcedure.mutation(({ ctx }) => {
    ctx.res.clearCookie("app_session_id", {
      httpOnly: true,
      path: "/",
      sameSite: "none",
      secure: false,
      maxAge: -1
    });
    return { success: true };
  }),
  // Kullanıcının yönetici olduğu sunucular + botun ekli olup olmadığı bilgisi
  guilds: publicProcedure.input(z2.object({ force: z2.boolean().optional() }).optional()).query(async ({ ctx, input }) => {
    const session = await requireDiscord(ctx);
    const guilds = await fetchManageableGuilds(session.discordAccessToken, input?.force ?? false);
    const settings = await getBotSettings();
    const bridgeConfigured = Boolean(process.env.BOT_BRIDGE_URL || settings?.bridgeUrl);
    const installedIds = bridgeConfigured ? await getInstalledGuildIds() : [];
    const installedSet = new Set(installedIds);
    return {
      bridgeConfigured,
      // Bot davet bağlantısı (genel; belirli sunucu için inviteUrl alanı ayrıca üretilir)
      inviteUrl: buildBotInviteUrl(),
      guilds: guilds.map((g) => ({
        id: g.id,
        name: g.name,
        owner: g.owner,
        iconUrl: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128` : null,
        // Bot bu sunucuda ekli mi?
        botPresent: installedSet.has(g.id),
        // Bu sunucuya botu eklemek için doğrudan bağlantı.
        inviteUrl: buildBotInviteUrl(g.id)
      }))
    };
  }),
  // Sunucu kanal/kategori detayları + sistem durumu (bridge üzerinden)
  guildDetail: publicProcedure.input(guildIdSchema).query(async ({ ctx, input }) => {
    const session = await requireDiscord(ctx);
    const guilds = await fetchManageableGuilds(session.discordAccessToken);
    const guild = guilds.find((g) => g.id === input.guildId);
    if (!guild) {
      throw new TRPCError4({ code: "FORBIDDEN", message: "Bu sunucuya eri\u015Fim yetkiniz yok." });
    }
    const [detail, status] = await Promise.all([
      getGuildDetail(input.guildId),
      getSystemStatus(input.guildId)
    ]);
    return {
      guild,
      detail,
      status,
      inviteUrl: buildBotInviteUrl(input.guildId)
    };
  }),
  // Bot bağlantı ayarları (yalnızca sahip)
  botSettings: publicProcedure.query(async ({ ctx }) => {
    await requireOwner(ctx);
    const settings = await getBotSettings();
    return {
      bridgeUrl: process.env.BOT_BRIDGE_URL || settings?.bridgeUrl || "",
      lastConnectedAt: settings?.lastConnectedAt ?? null
    };
  }),
  saveBotSettings: publicProcedure.input(z2.object({ bridgeUrl: z2.string().url("Ge\xE7erli bir URL girin.") })).mutation(async ({ ctx, input }) => {
    const session = await requireOwner(ctx);
    const result = await pingBridge(input.bridgeUrl).catch((e) => {
      throw new TRPCError4({
        code: "BAD_REQUEST",
        message: `Ba\u011Flant\u0131 testi ba\u015Far\u0131s\u0131z: ${e?.message ?? "ula\u015F\u0131lamad\u0131"}`
      });
    });
    if (!result.ok) {
      throw new TRPCError4({ code: "BAD_REQUEST", message: "Bot yan\u0131t verdi ama 'ok: false' d\xF6nd\xFCrd\xFC." });
    }
    await saveBotSettings({
      bridgeUrl: input.bridgeUrl,
      updatedBy: session.openId,
      lastConnectedAt: /* @__PURE__ */ new Date()
    });
    return { ok: true, botTag: result.botTag };
  }),
  // Bridge bağlantı testi (yalnızca sahip)
  testBridge: publicProcedure.query(async ({ ctx }) => {
    await requireOwner(ctx);
    const localUrl = process.env.BOT_BRIDGE_URL;
    if (localUrl) {
      try {
        const result = await pingBridge(localUrl);
        return { configured: true, ok: result.ok, botTag: result.botTag };
      } catch {
        return { configured: true, ok: false };
      }
    }
    const settings = await getBotSettings();
    if (!settings?.bridgeUrl) return { configured: false, ok: false };
    try {
      const result = await pingBridge(settings.bridgeUrl);
      return { configured: true, ok: result.ok, botTag: result.botTag };
    } catch {
      return { configured: true, ok: false };
    }
  }),
  // Destek sistemi kurulum
  destekSetup: publicProcedure.input(
    z2.discriminatedUnion("mode", [
      z2.object({ guildId: z2.string(), mode: z2.literal("auto") }),
      z2.object({ guildId: z2.string(), mode: z2.literal("manual"), kategoriId: z2.string(), kanalId: z2.string() })
    ])
  ).mutation(async ({ ctx, input }) => {
    await requireDiscord(ctx);
    return setupDestek(input);
  }),
  destekDelete: publicProcedure.input(z2.object({ guildId: z2.string() })).mutation(async ({ ctx, input }) => {
    await requireDiscord(ctx);
    return deleteDestek(input.guildId);
  }),
  // Kulüp sistemi kurulum
  kulupSetup: publicProcedure.input(
    z2.discriminatedUnion("mode", [
      z2.object({ guildId: z2.string(), mode: z2.literal("auto") }),
      z2.object({ guildId: z2.string(), mode: z2.literal("manual"), kategoriId: z2.string(), metinKanalId: z2.string(), sesliKanalId: z2.string() })
    ])
  ).mutation(async ({ ctx, input }) => {
    await requireDiscord(ctx);
    return setupKulup(input);
  }),
  kulupDelete: publicProcedure.input(z2.object({ guildId: z2.string() })).mutation(async ({ ctx, input }) => {
    await requireDiscord(ctx);
    return deleteKulup(input.guildId);
  }),
  // ─── Talep (ticket) logları ──────────────────────────────────────────
  // Kapanan taleplerin özet listesi
  talepLoglari: publicProcedure.input(guildIdSchema).query(async ({ ctx, input }) => {
    const session = await requireDiscord(ctx);
    const guilds = await fetchManageableGuilds(session.discordAccessToken);
    if (!guilds.some((g) => g.id === input.guildId)) {
      throw new TRPCError4({ code: "FORBIDDEN", message: "Bu sunucuya eri\u015Fim yetkiniz yok." });
    }
    return { loglar: await getTalepLoglari(input.guildId) };
  }),
  // Tek bir talebin tüm mesajları
  talepLog: publicProcedure.input(z2.object({ guildId: z2.string().min(1), talepId: z2.string().min(1) })).query(async ({ ctx, input }) => {
    const session = await requireDiscord(ctx);
    const guilds = await fetchManageableGuilds(session.discordAccessToken);
    if (!guilds.some((g) => g.id === input.guildId)) {
      throw new TRPCError4({ code: "FORBIDDEN", message: "Bu sunucuya eri\u015Fim yetkiniz yok." });
    }
    return getTalepLog(input.guildId, input.talepId);
  }),
  // Bot sahibi: tüm sunucular listesi
  allGuilds: publicProcedure.query(async ({ ctx }) => {
    await requireOwner(ctx);
    const guilds = await getAllGuilds();
    return { guilds };
  }),
  // Bot sahibi: sunucudan ayrıl
  leaveGuild: publicProcedure.input(z2.object({ guildId: z2.string().min(1) })).mutation(async ({ ctx, input }) => {
    await requireOwner(ctx);
    return leaveGuild(input.guildId);
  }),
  // Destek rol güncelleme
  destekRolGuncelle: publicProcedure.input(z2.object({ guildId: z2.string().min(1), rolId: z2.string().min(1) })).mutation(async ({ ctx, input }) => {
    await requireDiscord(ctx);
    return updateDestekRole(input.guildId, input.rolId);
  }),
  // Kulüp metin kanalı güncelleme
  kulupMetinKanalGuncelle: publicProcedure.input(z2.object({ guildId: z2.string().min(1), metinKanalId: z2.string().min(1) })).mutation(async ({ ctx, input }) => {
    await requireDiscord(ctx);
    return updateKulupMetinKanal(input.guildId, input.metinKanalId);
  }),
  // Bot sahibi: sunucu detayı (yönetici olmasa bile)
  ownerGuildDetail: publicProcedure.input(guildIdSchema).query(async ({ ctx, input }) => {
    await requireOwner(ctx);
    const [detail, status] = await Promise.all([
      getGuildDetail(input.guildId),
      getSystemStatus(input.guildId)
    ]);
    return { detail, status, inviteUrl: buildBotInviteUrl(input.guildId) };
  }),
  // Bot sahibi: geliştirici listesi
  geli\u015Ftiriciler: publicProcedure.query(async ({ ctx }) => {
    await requireOwner(ctx);
    return getGeli\u015Ftiriciler();
  }),
  // Bot sahibi: geliştirici ekle
  geli\u015Ftiriciekle: publicProcedure.input(z2.object({ discordId: z2.string().min(1) })).mutation(async ({ ctx, input }) => {
    await requireOwner(ctx);
    return addGeli\u015Ftirici(input.discordId);
  }),
  // Bot sahibi: geliştirici sil
  geli\u015Ftiricisil: publicProcedure.input(z2.object({ discordId: z2.string().min(1) })).mutation(async ({ ctx, input }) => {
    await requireOwner(ctx);
    return removeGeli\u015Ftirici(input.discordId);
  })
});

// server/routers.ts
var appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  discord: discordRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true
      };
    })
  })
  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/_core/vite.ts
import express from "express";
import fs from "fs";
import { nanoid } from "nanoid";
import path2 from "path";
import { createServer as createViteServer } from "vite";

// vite.config.ts
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";
var PROJECT_ROOT = import.meta.dirname;
var plugins = [react(), tailwindcss()];
var vite_config_default = defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    host: true,
    allowedHosts: ["localhost", "127.0.0.1"],
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/_core/vite.ts
async function setupVite(app, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    server: serverOptions,
    appType: "custom"
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app) {
  const distPath = process.env.NODE_ENV === "development" ? path2.resolve(import.meta.dirname, "../..", "dist", "public") : path2.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/_core/index.ts
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}
async function findAvailablePort(startPort = 3e3) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
async function startServer() {
  const app = express2();
  const server = createServer(app);
  app.use(express2.json({ limit: "50mb" }));
  app.use(express2.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerDiscordAuthRoutes(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
startServer().catch(console.error);
