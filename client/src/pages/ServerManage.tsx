import PanelShell from "@/components/PanelShell";
import SystemCard from "@/components/SystemCard";
import { Button } from "@/components/ui/button";
import { useDiscordAuth } from "@/lib/discord";
import { trpc } from "@/lib/trpc";
import { AlertCircle, ArrowLeft, Crown, Loader2, Plus, RefreshCw, Shield } from "lucide-react";
import { useEffect } from "react";
import { Link, useLocation, useParams } from "wouter";

export default function ServerManage() {
  const { isAuthenticated, loading: authLoading, isOwner } = useDiscordAuth();
  const [, navigate] = useLocation();
  const params = useParams();
  const guildId = params.guildId as string;

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/");
  }, [authLoading, isAuthenticated, navigate]);

  // Normal kullanıcı için standart sorgu
  const detailQuery = trpc.discord.guildDetail.useQuery(
    { guildId },
    {
      enabled: isAuthenticated && Boolean(guildId) && !isOwner,
      retry: false,
    }
  );

  // Bot sahibi için özel sorgu (yönetici olmasa bile erişebilir)
  const ownerDetailQuery = trpc.discord.ownerGuildDetail.useQuery(
    { guildId },
    {
      enabled: isAuthenticated && Boolean(guildId) && isOwner,
      retry: false,
    }
  );

  // Aktif sorgu ve veri
  const activeQuery = isOwner ? ownerDetailQuery : detailQuery;
  const guildName = isOwner
    ? ownerDetailQuery.data?.detail?.name
    : detailQuery.data?.guild?.name;
  const guildOwner = isOwner ? false : detailQuery.data?.guild?.owner;
  const detail = isOwner ? ownerDetailQuery.data?.detail : detailQuery.data?.detail;
  const status = isOwner ? ownerDetailQuery.data?.status : detailQuery.data?.status;
  const inviteUrl = isOwner ? ownerDetailQuery.data?.inviteUrl : detailQuery.data?.inviteUrl;

  return (
    <PanelShell>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link href="/servers">
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5">
            <ArrowLeft className="h-4 w-4" />
            Sunuculara dön
          </span>
        </Link>

        {activeQuery.isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-20 justify-center">
            <Loader2 className="h-5 w-5 animate-spin" />
            Sunucu bilgileri ve sistemler yükleniyor…
          </div>
        ) : activeQuery.error ? (
          <BridgeError message={activeQuery.error.message} onRetry={() => activeQuery.refetch()} />
        ) : detail && status ? (
          <>
            <div className="flex items-center justify-between gap-4 mb-7">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight">{guildName}</h1>
                {guildOwner && <Crown className="h-4 w-4 text-amber-400" />}
                {isOwner && !guildOwner && (
                  <span className="inline-flex items-center gap-1 text-xs text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">
                    <Shield className="h-3 w-3" />
                    Bot Sahibi Erişimi
                  </span>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="bg-card/60"
                onClick={() => activeQuery.refetch()}
                disabled={activeQuery.isFetching}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${activeQuery.isFetching ? "animate-spin" : ""}`} />
                Yenile
              </Button>
            </div>

            {!detail.botPresent && (
              <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
                <div className="text-sm flex-1">
                  <p className="font-medium text-amber-200">Patrick botu bu sunucuda değil</p>
                  <p className="text-amber-200/80 mt-0.5">
                    Sistemleri kurabilmek için Patrick botunun bu sunucuya eklenmiş olması gerekir.
                  </p>
                  {inviteUrl && (
                    <a
                      href={inviteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 mt-3 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 px-3 py-1.5 text-xs font-medium transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Botu bu sunucuya ekle
                    </a>
                  )}
                </div>
              </div>
            )}

            <div className="grid gap-5">
              <SystemCard
                kind="destek"
                guildId={guildId}
                status={status.destek}
                detail={detail}
                onChanged={() => activeQuery.refetch()}
              />
              <SystemCard
                kind="kulup"
                guildId={guildId}
                status={status.kulup}
                detail={detail}
                onChanged={() => activeQuery.refetch()}
              />
            </div>
          </>
        ) : null}
      </div>
    </PanelShell>
  );
}

function BridgeError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/10 py-12 text-center">
      <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-3" />
      <h3 className="font-semibold">Sunucu bilgileri alınamadı</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">{message}</p>
      <div className="flex items-center justify-center gap-2 mt-4">
        <Button variant="outline" size="sm" className="bg-card/60" onClick={onRetry}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Tekrar dene
        </Button>
        <Link href="/settings">
          <Button variant="ghost" size="sm">Bot Ayarları</Button>
        </Link>
      </div>
    </div>
  );
}
