import PanelShell from "@/components/PanelShell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDiscordAuth } from "@/lib/discord";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Loader2, LogOut, Plug, RefreshCw, Server, Shield, Trash2, UserPlus, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function BotSettings() {
  const { isAuthenticated, loading: authLoading, isOwner } = useDiscordAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      navigate("/");
    } else if (!isOwner) {
      navigate("/servers");
    }
  }, [authLoading, isAuthenticated, isOwner, navigate]);

  const utils = trpc.useUtils();
  const settingsQuery = trpc.discord.botSettings.useQuery(undefined, { enabled: isAuthenticated && isOwner, retry: false });
  const testQuery = trpc.discord.testBridge.useQuery(undefined, { enabled: isAuthenticated && isOwner, retry: false });
  const allGuildsQuery = trpc.discord.allGuilds.useQuery(undefined, { enabled: isAuthenticated && isOwner, retry: false });
  const devsQuery = trpc.discord.geliştiriciler.useQuery(undefined, { enabled: isAuthenticated && isOwner, retry: false });

  const [bridgeUrl, setBridgeUrl] = useState("");
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const [newDevId, setNewDevId] = useState("");

  useEffect(() => {
    if (settingsQuery.data) setBridgeUrl(settingsQuery.data.bridgeUrl);
  }, [settingsQuery.data]);

  const saveMutation = trpc.discord.saveBotSettings.useMutation({
    onSuccess: () => {
      toast.success("Bot bağlantısı kaydedildi ve doğrulandı.");
      utils.discord.botSettings.invalidate();
      utils.discord.testBridge.invalidate();
      utils.discord.guilds.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const leaveMutation = trpc.discord.leaveGuild.useMutation({
    onSuccess: () => {
      toast.success("Sunucudan ayrıldı.");
      setLeavingId(null);
      utils.discord.allGuilds.invalidate();
      utils.discord.guilds.invalidate();
    },
    onError: e => {
      toast.error(e.message);
      setLeavingId(null);
    },
  });

  const addDevMutation = trpc.discord.geliştiriciekle.useMutation({
    onSuccess: () => {
      toast.success("Geliştirici eklendi.");
      setNewDevId("");
      utils.discord.geliştiriciler.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const removeDevMutation = trpc.discord.geliştiricisil.useMutation({
    onSuccess: () => {
      toast.success("Geliştirici kaldırıldı.");
      utils.discord.geliştiriciler.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const connected = testQuery.data?.configured && testQuery.data?.ok;

  if (!authLoading && isAuthenticated && !isOwner) return null;

  return (
    <PanelShell>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight">Bot Ayarları</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Panelin botunuzla konuşabilmesi için, kendi bilgisayarınızda çalışan botun köprü adresini girin.
        </p>

        {/* Bağlantı durumu */}
        <div className="mt-6 rounded-xl border border-border bg-card/70 p-4 flex items-center gap-3">
          <div className={`grid place-items-center h-10 w-10 rounded-lg ${connected ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground"}`}>
            <Plug className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">Bağlantı Durumu</p>
            {testQuery.isLoading ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                <Loader2 className="h-3 w-3 animate-spin" /> Kontrol ediliyor…
              </p>
            ) : connected ? (
              <p className="text-xs text-emerald-400 flex items-center gap-1.5 mt-0.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Bota bağlanıldı{testQuery.data?.botTag ? ` · ${testQuery.data.botTag}` : ""}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                <XCircle className="h-3.5 w-3.5" />
                {testQuery.data?.configured ? "Bota ulaşılamıyor" : "Henüz ayarlanmadı"}
              </p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => testQuery.refetch()} disabled={testQuery.isFetching}>
            <RefreshCw className={`h-4 w-4 ${testQuery.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Köprü adresi formu */}
        <div className="mt-4 rounded-xl border border-border bg-card/70 p-5">
          <Label htmlFor="bridge" className="text-sm font-medium">Köprü Adresi (Bridge URL)</Label>
          <p className="text-xs text-muted-foreground mt-1 mb-3">
            Bot paketini bilgisayarınızda başlattığınızda size verilen <code className="text-foreground">https://…</code> adresini buraya yapıştırın.
          </p>
          <Input
            id="bridge"
            value={bridgeUrl}
            onChange={e => setBridgeUrl(e.target.value)}
            placeholder="https://Patrick-bot-xxxx.trycloudflare.com"
            className="bg-background/60"
          />
          <div className="flex justify-end mt-4">
            <Button
              onClick={() => saveMutation.mutate({ bridgeUrl: bridgeUrl.trim() })}
              disabled={saveMutation.isPending || !bridgeUrl.trim()}
              className="bg-primary hover:bg-primary/90 active:scale-[0.98] transition-transform"
            >
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Kaydet ve Test Et
            </Button>
          </div>
        </div>

        {/* Geliştirici Yönetimi */}
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">Geliştirici Yönetimi</h2>
            {devsQuery.data && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {devsQuery.data.geliştiriciler.length}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Geliştiriciler bot sahibiyle aynı yetkilere sahiptir. Discord kullanıcı ID'si ile ekleyin.
            Bot üzerinde <code className="text-foreground">!geliştirici &lt;id&gt;</code> ve <code className="text-foreground">!geliştirici-sil &lt;id&gt;</code> komutlarıyla da yönetebilirsiniz.
          </p>

          {/* Geliştirici ekleme formu */}
          <div className="flex gap-2 mb-4">
            <Input
              value={newDevId}
              onChange={e => setNewDevId(e.target.value)}
              placeholder="Discord Kullanıcı ID'si (örn: 123456789012345678)"
              className="bg-background/60"
            />
            <Button
              onClick={() => {
                if (!newDevId.trim()) return;
                addDevMutation.mutate({ discordId: newDevId.trim() });
              }}
              disabled={addDevMutation.isPending || !newDevId.trim()}
              className="shrink-0"
            >
              {addDevMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            </Button>
          </div>

          {devsQuery.isLoading ? (
            <div className="space-y-2">
              {[1, 2].map(i => (
                <div key={i} className="rounded-xl border border-border bg-card/40 p-3 h-[52px] animate-pulse flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-muted" />
                  <div className="flex-1 h-3 w-1/3 rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : !devsQuery.data?.geliştiriciler.length ? (
            <p className="text-sm text-muted-foreground py-3 text-center">Henüz geliştirici eklenmemiş.</p>
          ) : (
            <div className="space-y-2">
              {devsQuery.data.geliştiriciler.map((id: string) => (
                <div key={id} className="rounded-xl border border-border bg-card/70 p-3 flex items-center gap-3">
                  <div className="grid place-items-center h-8 w-8 rounded-lg bg-primary/15 text-primary shrink-0">
                    <Shield className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm truncate">{id}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-destructive hover:bg-destructive/10"
                    disabled={removeDevMutation.isPending}
                    onClick={() => {
                      if (confirm(`Bu geliştiriciyi kaldırmak istediğinizden emin misiniz?`)) {
                        removeDevMutation.mutate({ discordId: id });
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Botun ekli olduğu sunucular */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-primary" />
              <h2 className="text-base font-semibold">Ekli Olduğu Sunucular</h2>
              {allGuildsQuery.data && (
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {allGuildsQuery.data.guilds.length}
                </span>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={() => allGuildsQuery.refetch()} disabled={allGuildsQuery.isFetching}>
              <RefreshCw className={`h-3.5 w-3.5 ${allGuildsQuery.isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {allGuildsQuery.isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="rounded-xl border border-border bg-card/40 p-3 h-[60px] animate-pulse flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-muted" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-1/2 rounded bg-muted" />
                    <div className="h-2.5 w-1/3 rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : allGuildsQuery.error ? (
            <p className="text-sm text-destructive">Sunucular yüklenemedi: {allGuildsQuery.error.message}</p>
          ) : !allGuildsQuery.data?.guilds.length ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Bot henüz hiçbir sunucuda değil.</p>
          ) : (
            <div className="space-y-2">
              {allGuildsQuery.data.guilds.map(g => (
                <div key={g.id} className="rounded-xl border border-border bg-card/70 p-3 flex items-center gap-3">
                  <Avatar className="h-9 w-9 rounded-lg">
                    {g.iconUrl && <AvatarImage src={g.iconUrl} alt={g.name} />}
                    <AvatarFallback className="rounded-lg bg-primary/20 text-foreground text-xs font-semibold">
                      {g.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{g.name}</p>
                    <p className="text-xs text-muted-foreground">{g.id}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 text-destructive border-destructive/30 hover:bg-destructive/10 hover:border-destructive/60"
                    disabled={leavingId === g.id}
                    onClick={() => {
                      if (confirm(`"${g.name}" sunucusundan ayrılmak istediğinizden emin misiniz?`)) {
                        setLeavingId(g.id);
                        leaveMutation.mutate({ guildId: g.id });
                      }
                    }}
                  >
                    {leavingId === g.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <LogOut className="h-3.5 w-3.5 mr-1" />
                    )}
                    Ayrıl
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 rounded-xl border border-border bg-card/40 p-5 text-sm text-muted-foreground leading-relaxed">
          <p className="font-medium text-foreground mb-1">Nasıl çalışır?</p>
          Botunuz kendi bilgisayarınızda çalışır ve güvenli bir tünelle internete açılır. Bu panel, yukarıdaki köprü adresi üzerinden botunuza komut gönderir. Bilgisayarınız açık ve bot çalışır durumdayken panelden yaptığınız her değişiklik anında Discord'a yansır.
        </div>
      </div>
    </PanelShell>
  );
}
