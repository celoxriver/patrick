import PanelShell from "@/components/PanelShell";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useDiscordAuth } from "@/lib/discord";
import { trpc } from "@/lib/trpc";
import { AlertCircle, ArrowLeft, Bot, Loader2, MessageSquare, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { Link, useLocation, useParams } from "wouter";

/** Tarih biçimleyici (TR). */
function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("tr-TR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function TalepLoglari() {
  const { isAuthenticated, loading: authLoading } = useDiscordAuth();
  const [, navigate] = useLocation();
  const params = useParams();
  const guildId = params.guildId as string;
  // İsteğe bağlı talep ID (varsa detay görünümü)
  const talepId = (params as Record<string, string>).talepId;

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/");
  }, [authLoading, isAuthenticated, navigate]);

  return (
    <PanelShell>
      <div className="max-w-4xl mx-auto px-4 py-8">
        {talepId ? (
          <TalepDetay guildId={guildId} talepId={talepId} enabled={isAuthenticated} />
        ) : (
          <TalepListesi guildId={guildId} enabled={isAuthenticated} />
        )}
      </div>
    </PanelShell>
  );
}

// ─── Liste görünümü ──────────────────────────────────────────────────────────

function TalepListesi({ guildId, enabled }: { guildId: string; enabled: boolean }) {
  const q = trpc.discord.talepLoglari.useQuery({ guildId }, { enabled, retry: false });

  return (
    <>
      <Link href={`/servers/${guildId}`}>
        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5">
          <ArrowLeft className="h-4 w-4" />
          Sisteme dön
        </span>
      </Link>

      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Talep Logları</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Kapatılan destek taleplerinin kayıtları. Okumak için bir talebe tıklayın.
          </p>
        </div>
        <Button variant="outline" size="sm" className="bg-card/60" onClick={() => q.refetch()} disabled={q.isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${q.isFetching ? "animate-spin" : ""}`} />
          Yenile
        </Button>
      </div>

      {q.isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-20 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loglar yükleniyor…
        </div>
      ) : q.error ? (
        <ErrorBox message={q.error.message} onRetry={() => q.refetch()} />
      ) : !q.data || q.data.loglar.length === 0 ? (
        <EmptyBox />
      ) : (
        <div className="grid gap-2.5">
          {q.data.loglar.map(t => (
            <Link key={t.id} href={`/servers/${guildId}/loglar/${t.id}`}>
              <div className="group rounded-xl border border-border bg-card/70 p-4 transition-all hover:border-primary/50 hover:bg-card cursor-pointer flex items-center gap-3">
                <div className="grid place-items-center h-10 w-10 rounded-lg bg-primary/15 text-primary shrink-0">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1"><p className="text-sm text-muted-foreground truncate mt-0.5">{t.konu}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold">{t.id}</p>
                    <span className="text-xs text-muted-foreground">· {t.mesajSayisi} mesaj</span>
                  </div>
                  {t.konu && <p className="text-sm text-muted-foreground truncate mt-0.5">{t.konu}</p>}
                  <p className="text-xs text-muted-foreground/80 mt-0.5">
                    {t.acanEtiket ? `${t.acanEtiket} · ` : ""}Kapanış: {fmt(t.kapanisZamani)}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

// ─── Detay (Discord görünümü) ─────────────────────────────────────────────────

function TalepDetay({ guildId, talepId, enabled }: { guildId: string; talepId: string; enabled: boolean }) {
  const q = trpc.discord.talepLog.useQuery({ guildId, talepId }, { enabled, retry: false });

  return (
    <>
      <Link href={`/servers/${guildId}/loglar`}>
        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5">
          <ArrowLeft className="h-4 w-4" />
          Talep listesine dön
        </span>
      </Link>

      {q.isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-20 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
          Mesajlar yükleniyor…
        </div>
      ) : q.error ? (
        <ErrorBox message={q.error.message} onRetry={() => q.refetch()} />
      ) : q.data ? (
        <>
          <div className="mb-5">
            <h1 className="text-2xl font-bold tracking-tight">{q.data.id}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {q.data.acanEtiket ? `Açan: ${q.data.acanEtiket} · ` : ""}
              {q.data.mesajSayisi} mesaj · Kapanış: {fmt(q.data.kapanisZamani)}
            </p>
            {q.data.konu && (
              <p className="text-sm mt-2 rounded-lg bg-background/50 border border-border px-3 py-2">
                <span className="text-muted-foreground">Konu: </span>
                {q.data.konu}
              </p>
            )}
          </div>

          {/* Discord benzeri mesaj akışı */}
          <div className="rounded-xl border border-border bg-[#313338] text-[#dbdee1] overflow-hidden">
            <div className="px-4 py-3 border-b border-black/20 bg-[#2b2d31] flex items-center gap-2 text-sm font-medium text-white/90">
              <MessageSquare className="h-4 w-4" />
              #{q.data.id}
            </div>
            <div className="py-3">
              {q.data.mesajlar.length === 0 ? (
                <p className="text-center text-sm text-white/40 py-10">Bu talepte mesaj bulunamadı.</p>
              ) : (
                q.data.mesajlar.map(m => (
                  <div key={m.id} className="flex gap-3 px-4 py-1.5 hover:bg-black/15">
                    <Avatar className="h-10 w-10 mt-0.5 shrink-0">
                      {m.avatarUrl && <AvatarImage src={m.avatarUrl} alt={m.yazarAdi} />}
                      <AvatarFallback className="bg-[#5865f2] text-white text-xs">
                        {m.yazarAdi.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-semibold text-sm ${m.bot ? "text-[#a8b9ff]" : "text-white"}`}>
                          {m.yazarAdi}
                        </span>
                        {m.bot && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-[#5865f2] px-1 py-0.5 text-[10px] font-bold text-white uppercase leading-none">
                            <Bot className="h-2.5 w-2.5" />
                            Bot
                          </span>
                        )}
                        <span className="text-[11px] text-white/40">{fmt(m.zaman)}</span>
                      </div>
{m.icerik && (
  <div className="mt-0.5 text-sm leading-relaxed text-[#dbdee1]">
    {(m.icerik.length > 400 ? m.icerik.slice(0, 400) + "\u2026" : m.icerik)
      .split("\n")
      .map((line, i) =>
        line.trim().startsWith(">") ? (
          <blockquote
            key={i}
            className="my-1 border-l-2 border-white/25 pl-3 text-white/75"
          >
            {line.replace(/^>\s?/, "")}
          </blockquote>
        ) : (
          <p key={i} className="whitespace-pre-wrap break-words">
            {line}
          </p>
        )
      )}
  </div>
)}
                      {m.ekler.length > 0 && (
                        <div className="mt-1.5 flex flex-col gap-1.5">
                          {m.ekler.map((e, i) =>
                            e.gorsel ? (
                              <a key={i} href={e.url} target="_blank" rel="noopener noreferrer">
                                <img
                                  src={e.url}
                                  alt={e.ad}
                                  className="max-w-xs max-h-72 rounded-lg border border-black/30"
                                  loading="lazy"
                                />
                              </a>
                            ) : (
                              <a
                                key={i}
                                href={e.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-[#00a8fc] underline break-all"
                              >
                                📎 {e.ad}
                              </a>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

// ─── Yardımcı durum kutuları ──────────────────────────────────────────────────

function EmptyBox() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/40 py-16 text-center">
      <div className="grid place-items-center h-12 w-12 rounded-full bg-muted mx-auto mb-4">
        <MessageSquare className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="font-semibold">Henüz kapatılmış talep yok</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
        Bir destek talebi kapatıldığında (`!kapat`), tüm yazışmaları burada otomatik olarak görünür.
      </p>
    </div>
  );
}

function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/10 py-12 text-center">
      <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-3" />
      <h3 className="font-semibold">Loglar yüklenemedi</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">{message}</p>
      <Button variant="outline" size="sm" className="mt-4 bg-card/60" onClick={onRetry}>
        <RefreshCw className="h-4 w-4 mr-2" />
        Tekrar dene
      </Button>
    </div>
  );
}
