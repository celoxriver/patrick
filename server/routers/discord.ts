import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import {
  addGeliştirici,
  deleteDestek,
  deleteKulup,
  getAllGuilds,
  getGeliştiriciler,
  getGuildDetail,
  getInstalledGuildIds,
  getSystemStatus,
  getTalepLog,
  getTalepLoglari,
  leaveGuild,
  removeGeliştirici,
  pingBridge,
  setupDestek,
  setupKulup,
  updateDestekRole,
  updateKulupMetinKanal,
} from "../_core/botBridge";
import { fetchManageableGuilds, getDiscordSession, type DiscordSession } from "../_core/discordSession";
import { buildBotInviteUrl, isOwner } from "../_core/env";
import { publicProcedure, router } from "../_core/trpc";

async function requireDiscord(ctx: { req: any }): Promise<DiscordSession> {
  const session = await getDiscordSession(ctx.req);
  if (!session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Lütfen Discord ile giriş yapın." });
  }
  return session;
}

/**
 * Sadece panel sahibinin erişebileceği işlemler için kullanılır.
 * Sahip değilse FORBIDDEN döner.
 */
async function requireOwner(ctx: { req: any }): Promise<DiscordSession> {
  const session = await requireDiscord(ctx);
  if (!isOwner({ openId: session.openId, discordId: session.discordId })) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Bu sayfa yalnızca panel sahibine açıktır.",
    });
  }
  return session;
}

const guildIdSchema = z.object({ guildId: z.string().min(1) });

export const discordRouter = router({
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
      avatarUrl: session.discordAvatar
        ? `https://cdn.discordapp.com/avatars/${session.discordId}/${session.discordAvatar}.png?size=128`
        : null,
      // Panel sahibi mi? Bot Ayarları gibi sahibe özel alanlar bununla gizlenir.
      isOwner: isOwner({ openId: session.openId, discordId: session.discordId }),
    };
  }),

  logout: publicProcedure.mutation(({ ctx }) => {
    ctx.res.clearCookie("app_session_id", {
      httpOnly: true,
      path: "/",
      sameSite: "none",
      secure: false,
      maxAge: -1,
    });
    return { success: true } as const;
  }),

  // Kullanıcının yönetici olduğu sunucular + botun ekli olup olmadığı bilgisi
  guilds: publicProcedure
    .input(z.object({ force: z.boolean().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const session = await requireDiscord(ctx);
      const guilds = await fetchManageableGuilds(session.discordAccessToken, input?.force ?? false);
      const settings = await db.getBotSettings();
      const bridgeConfigured = Boolean(process.env.BOT_BRIDGE_URL || settings?.bridgeUrl);

      // Botun ekli olduğu sunucuları köprüden öğren (ulaşılamazsa boş liste).
      const installedIds = bridgeConfigured ? await getInstalledGuildIds() : [];
      const installedSet = new Set(installedIds);

      return {
        bridgeConfigured,
        // Bot davet bağlantısı (genel; belirli sunucu için inviteUrl alanı ayrıca üretilir)
        inviteUrl: buildBotInviteUrl(),
        guilds: guilds.map(g => ({
          id: g.id,
          name: g.name,
          owner: g.owner,
          iconUrl: g.icon
            ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128`
            : null,
          // Bot bu sunucuda ekli mi?
          botPresent: installedSet.has(g.id),
          // Bu sunucuya botu eklemek için doğrudan bağlantı.
          inviteUrl: buildBotInviteUrl(g.id),
        })),
      };
    }),

  // Sunucu kanal/kategori detayları + sistem durumu (bridge üzerinden)
  guildDetail: publicProcedure.input(guildIdSchema).query(async ({ ctx, input }) => {
    const session = await requireDiscord(ctx);
    // Önce Discord'dan sunucu bilgisini doğrula (önbellekli, 429'a takılmaz)
    const guilds = await fetchManageableGuilds(session.discordAccessToken);
    const guild = guilds.find(g => g.id === input.guildId);
    if (!guild) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Bu sunucuya erişim yetkiniz yok." });
    }
    // Bridge'den kanal + sistem bilgisi
    const [detail, status] = await Promise.all([
      getGuildDetail(input.guildId),
      getSystemStatus(input.guildId),
    ]);
    return {
      guild,
      detail,
      status,
      inviteUrl: buildBotInviteUrl(input.guildId),
    };
  }),

  // Bot bağlantı ayarları (yalnızca sahip)
  botSettings: publicProcedure.query(async ({ ctx }) => {
    await requireOwner(ctx);
    const settings = await db.getBotSettings();
    return {
      bridgeUrl: process.env.BOT_BRIDGE_URL || settings?.bridgeUrl || "",
      lastConnectedAt: settings?.lastConnectedAt ?? null,
    };
  }),

  saveBotSettings: publicProcedure
    .input(z.object({ bridgeUrl: z.string().url("Geçerli bir URL girin.") }))
    .mutation(async ({ ctx, input }) => {
      const session = await requireOwner(ctx);
      // Önce ping yaparak test et
      const result = await pingBridge(input.bridgeUrl).catch(e => {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Bağlantı testi başarısız: ${e?.message ?? "ulaşılamadı"}`,
        });
      });
      if (!result.ok) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Bot yanıt verdi ama 'ok: false' döndürdü." });
      }
      await db.saveBotSettings({
        bridgeUrl: input.bridgeUrl,
        updatedBy: session.openId,
        lastConnectedAt: new Date(),
      });
      return { ok: true, botTag: result.botTag };
    }),

  // Bridge bağlantı testi (yalnızca sahip)
  testBridge: publicProcedure.query(async ({ ctx }) => {
    await requireOwner(ctx);
    // Lokal ortamda BOT_BRIDGE_URL varsa onu kullan
    const localUrl = process.env.BOT_BRIDGE_URL;
    if (localUrl) {
      try {
        const result = await pingBridge(localUrl);
        return { configured: true, ok: result.ok, botTag: result.botTag };
      } catch {
        return { configured: true, ok: false };
      }
    }
    const settings = await db.getBotSettings();
    if (!settings?.bridgeUrl) return { configured: false, ok: false };
    try {
      const result = await pingBridge(settings.bridgeUrl);
      return { configured: true, ok: result.ok, botTag: result.botTag };
    } catch {
      return { configured: true, ok: false };
    }
  }),

  // Destek sistemi kurulum
  destekSetup: publicProcedure
    .input(
      z.discriminatedUnion("mode", [
        z.object({ guildId: z.string(), mode: z.literal("auto") }),
        z.object({ guildId: z.string(), mode: z.literal("manual"), kategoriId: z.string(), kanalId: z.string() }),
      ])
    )
    .mutation(async ({ ctx, input }) => {
      await requireDiscord(ctx);
      return setupDestek(input);
    }),

  destekDelete: publicProcedure
    .input(z.object({ guildId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireDiscord(ctx);
      return deleteDestek(input.guildId);
    }),

  // Kulüp sistemi kurulum
  kulupSetup: publicProcedure
    .input(
      z.discriminatedUnion("mode", [
        z.object({ guildId: z.string(), mode: z.literal("auto") }),
        z.object({ guildId: z.string(), mode: z.literal("manual"), kategoriId: z.string(), metinKanalId: z.string(), sesliKanalId: z.string() }),
      ])
    )
    .mutation(async ({ ctx, input }) => {
      await requireDiscord(ctx);
      return setupKulup(input);
    }),

  kulupDelete: publicProcedure
    .input(z.object({ guildId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireDiscord(ctx);
      return deleteKulup(input.guildId);
    }),

  // ─── Talep (ticket) logları ──────────────────────────────────────────

  // Kapanan taleplerin özet listesi
  talepLoglari: publicProcedure.input(guildIdSchema).query(async ({ ctx, input }) => {
    const session = await requireDiscord(ctx);
    // Sunucu erişim yetkisini doğrula (önbellekli)
    const guilds = await fetchManageableGuilds(session.discordAccessToken);
    if (!guilds.some(g => g.id === input.guildId)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Bu sunucuya erişim yetkiniz yok." });
    }
    return { loglar: await getTalepLoglari(input.guildId) };
  }),

  // Tek bir talebin tüm mesajları
  talepLog: publicProcedure
    .input(z.object({ guildId: z.string().min(1), talepId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const session = await requireDiscord(ctx);
      const guilds = await fetchManageableGuilds(session.discordAccessToken);
      if (!guilds.some(g => g.id === input.guildId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Bu sunucuya erişim yetkiniz yok." });
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
  leaveGuild: publicProcedure
    .input(z.object({ guildId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await requireOwner(ctx);
      return leaveGuild(input.guildId);
    }),

  // Destek rol güncelleme
  destekRolGuncelle: publicProcedure
    .input(z.object({ guildId: z.string().min(1), rolId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await requireDiscord(ctx);
      return updateDestekRole(input.guildId, input.rolId);
    }),

  // Kulüp metin kanalı güncelleme
  kulupMetinKanalGuncelle: publicProcedure
    .input(z.object({ guildId: z.string().min(1), metinKanalId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await requireDiscord(ctx);
      return updateKulupMetinKanal(input.guildId, input.metinKanalId);
    }),

  // Bot sahibi: sunucu detayı (yönetici olmasa bile)
  ownerGuildDetail: publicProcedure
    .input(guildIdSchema)
    .query(async ({ ctx, input }) => {
      await requireOwner(ctx);
      const [detail, status] = await Promise.all([
        getGuildDetail(input.guildId),
        getSystemStatus(input.guildId),
      ]);
      return { detail, status, inviteUrl: buildBotInviteUrl(input.guildId) };
    }),

  // Bot sahibi: geliştirici listesi
  geliştiriciler: publicProcedure.query(async ({ ctx }) => {
    await requireOwner(ctx);
    return getGeliştiriciler();
  }),

  // Bot sahibi: geliştirici ekle
  geliştiriciekle: publicProcedure
    .input(z.object({ discordId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await requireOwner(ctx);
      return addGeliştirici(input.discordId);
    }),

  // Bot sahibi: geliştirici sil
  geliştiricisil: publicProcedure
    .input(z.object({ discordId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await requireOwner(ctx);
      return removeGeliştirici(input.discordId);
    }),
});
