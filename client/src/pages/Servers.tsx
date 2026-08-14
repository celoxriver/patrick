import PanelShell from "@/components/PanelShell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useDiscordAuth } from "@/lib/discord";
import { AlertCircle, ChevronRight, Crown, Plus, RefreshCw, Server, Shield } from "lucide-react";
import { useEffect } from "react";
import { Link, useLocation } from "wouter";

export default function Servers() {
  const { isAuthenticated, loading: authLoading, isOwner } = useDiscordAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/");
  }, [authLoading, isAuthenticated, navigate]);

  const guildsQuery = trpc.discord.guilds.useQuery(
    {},
    { enabled: isAuthenticated, retry: false }
  );

  // Bot sahibi için tüm sunucular
  const allGuildsQuery = trpc.discord.allGuilds.useQuery(
    undefined,
    { enabled: isAuthenticated && isOwner, retry: false }
  );

  const utils = trpc.useUtils();
  const handleRefresh = () => {
    utils.discord.guilds.fetch({ force: true }).then(() => guildsQuery.refetch());
    if (isOwner) allGuildsQuery.refetch();
  };

  // Kullanıcının kendi sunucularının ID seti
  const myGuildIds = new Set((guildsQuery.data?.guilds ?? []).map(g => g.id));

  // Botun ekli olduğu sunucular (sahip olunmayanlar)
  const botOnlyGuilds = (allGuildsQuery.data?.guilds ?? []).filter(g => !myGuildIds.has(g.id));

  return (
    <PanelShell>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Patrick panel</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Yönetici olduğunuz Discord sunucularını seçerek sistemleri ayarlayın.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="bg-card/60"
            onClick={handleRefresh}
            disabled={guildsQuery.isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${guildsQuery.isFetching ? "animate-spin" : ""}`} />
            Yenile
          </Button>
        </div>

        {!guildsQuery.data?.bridgeConfigured && !guildsQuery.isLoading && (
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-amber-200">Bot henüz bağlı değil</p>
              <p className="text-amber-200/80 mt-0.5">
                {isOwner ? (
                  <>
                    Sistemleri ayarlayabilmek için önce botunuzu bağlamanız gerekiyor.{" "}
                    <Link href="/bot-settings" className="underline underline-offset-2 hover:text-amber-100">
                      Bot Ayarları
                    </Link>{" "}
                    sayfasından köprü adresini girin.
                  </>
                ) : (
                  <>Bot henüz panele bağlanmamış. Lütfen panel sahibiyle iletişime geçin.</>
                )}
              </p>
            </div>
          </div>
        )}

        {/* ─── Kendi sunucularım ─────────────────────────────────────────── */}
        {guildsQuery.isLoading ? (
          <LoadingGrid />
        ) : guildsQuery.error ? (
          <ErrorState message={guildsQuery.error.message} onRetry={() => guildsQuery.refetch()} />
        ) : guildsQuery.data && guildsQuery.data.guilds.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {guildsQuery.data?.guilds.map(g => {
              const card = (
                <div
                  className={`group rounded-xl border bg-card/70 p-4 transition-all hover:bg-card cursor-pointer h-full flex items-center gap-3 ${
                    g.botPresent
                      ? "border-border hover:border-primary/50"
                      : "border-amber-500/30 hover:border-amber-500/60"
                  }`}
                >
                  <Avatar className="h-12 w-12 rounded-xl">
                    {g.iconUrl && <AvatarImage src={g.iconUrl} alt={g.name} />}
                    <AvatarFallback className="rounded-xl bg-primary/20 text-foreground font-semibold">
                      {g.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold truncate">{g.name}</p>
                      {g.owner && <Crown className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
                    </div>
                    {g.botPresent ? (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {g.owner ? "Sunucu sahibi" : "Yönetici"}
                      </p>
                    ) : (
                      <p className="text-xs text-amber-400/90 mt-0.5 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Bot bu sunucuda yok · Eklemek için tıklayın
                      </p>
                    )}
                  </div>
                  {g.botPresent ? (
                    <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  ) : (
                    <Plus className="h-5 w-5 text-amber-400 transition-transform group-hover:scale-110" />
                  )}
                </div>
              );
              return g.botPresent ? (
                <Link key={g.id} href={`/servers/${g.id}`}>
                  {card}
                </Link>
              ) : (
                <a key={g.id} href={g.inviteUrl} target="_blank" rel="noopener noreferrer">
                  {card}
                </a>
              );
            })}
          </div>
        )}

        {/* ─── Bot sahibi: Botun ekli olduğu diğer sunucular ─────────────── */}
        {isOwner && botOnlyGuilds.length > 0 && (
          <div className="mt-10">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="h-4 w-4 text-primary" />
              <h2 className="text-lg font-semibold">Botun Ekli Olduğu Sunucular</h2>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {botOnlyGuilds.length}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Botun ekli olduğu ancak yönetici olmadığınız sunucular. Bu sunuculara tam müdahale yetkisine sahipsiniz.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {botOnlyGuilds.map(g => (
                <Link key={g.id} href={`/servers/${g.id}`}>
                  <div className="group rounded-xl border border-primary/30 bg-card/70 p-4 transition-all hover:bg-card hover:border-primary/60 cursor-pointer h-full flex items-center gap-3">
                    <Avatar className="h-12 w-12 rounded-xl">
                      {g.iconUrl && <AvatarImage src={g.iconUrl} alt={g.name} />}
                      <AvatarFallback className="rounded-xl bg-primary/20 text-foreground font-semibold">
                        {g.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="font-semibold truncate">{g.name}</p>
                        <Shield className="h-3.5 w-3.5 text-primary shrink-0" />
                      </div>
                      <p className="text-xs text-primary/70 mt-0.5">
                        Bot sahibi erişimi
                        {g.memberCount ? ` · ${g.memberCount.toLocaleString("tr")} üye` : ""}
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </PanelShell>
  );
}

function LoadingGrid() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card/40 p-4 h-[76px] flex items-center gap-3 animate-pulse">
          <div className="h-12 w-12 rounded-xl bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-2/3 rounded bg-muted" />
            <div className="h-2.5 w-1/3 rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/40 py-16 text-center">
      <div className="grid place-items-center h-12 w-12 rounded-full bg-muted mx-auto mb-4">
        <Server className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="font-semibold">Yönetebileceğiniz sunucu bulunamadı</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
        Yönetici (Administrator / Sunucuyu Yönet) yetkisine sahip olduğunuz bir Discord sunucusu görünmüyor.
      </p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/10 py-12 text-center">
      <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-3" />
      <h3 className="font-semibold">Sunucular yüklenemedi</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">{message}</p>
      <Button variant="outline" size="sm" className="mt-4 bg-card/60" onClick={onRetry}>
        <RefreshCw className="h-4 w-4 mr-2" />
        Tekrar dene
      </Button>
    </div>
  );
}
