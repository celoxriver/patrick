import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { startDiscordLogin, useDiscordAuth } from "@/lib/discord";
import { trpc } from "@/lib/trpc";
import { Loader2, LifeBuoy, LogOut, Server, Users, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

/** Landing + login page. Sade, koyu, Discord paleti. */
export default function Home() {
  const { isAuthenticated, loading, user, logout } = useDiscordAuth();
  const [, navigate] = useLocation();
  const [loggingOut, setLoggingOut] = useState(false);
  const inviteQuery = trpc.discord.botInviteUrl.useQuery(undefined, { retry: false });

  const handleLogout = async () => {
    setLoggingOut(true);
    await logout();
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-background text-foreground">
      {/* Soft blurple glow background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, oklch(0.62 0.21 268 / 0.18) 0%, transparent 70%), radial-gradient(40% 40% at 85% 80%, oklch(0.72 0.16 200 / 0.10) 0%, transparent 70%)",
        }}
      />
      <div className="relative max-w-5xl mx-auto px-4">
        {/* Header */}
        <header className="h-16 flex items-center justify-between">
          <span className="flex items-center gap-2.5">
            <span className="grid place-items-center h-9 w-9 rounded-xl bg-primary text-primary-foreground font-extrabold overflow-hidden">
              <img src="/Patrick-logo.svg" alt="Patrick" className="h-9 w-9 object-cover" onError={e => {
                (e.target as HTMLImageElement).style.display = 'none';
                (e.target as HTMLImageElement).parentElement!.textContent = 'A';
              }} />
            </span>
            <span className="font-semibold tracking-tight">Patrick Bot</span>
          </span>

          {/* Sağ üst: giriş yapılmışsa profil */}
          {isAuthenticated && user && (
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                className="bg-card/60 hidden sm:flex"
                onClick={() => navigate("/servers")}
              >
                <Server className="h-4 w-4 mr-2" />
                Patrick panel
              </Button>
              <div className="relative group">
                <button className="flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5 hover:bg-card transition-colors">
                  <Avatar className="h-6 w-6">
                    {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.username} />}
                    <AvatarFallback className="text-xs bg-primary/20">
                      {user.username.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium max-w-[120px] truncate">{user.name || user.username}</span>
                </button>
                {/* Dropdown */}
                <div className="absolute right-0 top-full mt-1 w-40 rounded-xl border border-border bg-card shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-destructive hover:bg-destructive/10 rounded-xl transition-colors"
                    onClick={handleLogout}
                    disabled={loggingOut}
                  >
                    {loggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                    Çıkış Yap
                  </button>
                </div>
              </div>
            </div>
          )}
        </header>

        {/* Hero Section */}
        <section className="pt-16 pb-10 sm:pt-24 text-center flex flex-col items-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            stade ağlarınızı tarıyor, güvenliğiniz sağlanıyoor.
          </span>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight max-w-2xl leading-[1.1]">
            Patrick'u <span className="text-primary">tek panelden</span> yönetin
          </h1>
          <p className="mt-5 text-base sm:text-lg text-muted-foreground max-w-xl">
            Discord hesabınızla giriş yapın, yönetici olduğunuz sunucuları görün ve
            <span className="text-foreground font-medium"> Destek Sistemi</span> ile
            <span className="text-foreground font-medium"> Kulüp Sistemi</span>'ni saniyeler içinde kurun.
          </p>

          <div className="mt-9">
            {loading ? (
              <Button size="lg" disabled className="h-12 px-7 text-base">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Yükleniyor
              </Button>
            ) : isAuthenticated && user ? (
              /* Giriş yapılmışsa: Hoşgeldin + Sunucularım */
              <div className="flex flex-col items-center gap-4">
                <div className="flex items-center gap-3 rounded-2xl border border-border bg-card/70 px-5 py-3">
                  <Avatar className="h-10 w-10">
                    {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.username} />}
                    <AvatarFallback className="bg-primary/20 font-semibold">
                      {user.username.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-left">
                    <p className="text-sm text-muted-foreground">Hoş geldin,</p>
                    <p className="font-semibold">{user.name || user.username}</p>
                  </div>
                </div>
                <Button
                  size="lg"
                  onClick={() => navigate("/servers")}
                  className="h-12 px-7 text-base bg-primary hover:bg-primary/90 active:scale-[0.98] transition-transform"
                >
                  <Server className="h-5 w-5 mr-2.5" />
                  Patrick panel
                </Button>
              </div>
            ) : (
              /* Giriş yapılmamışsa: Discord ile Giriş + Patrick'u Deneyin */
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <Button
                  size="lg"
                  onClick={startDiscordLogin}
                  className="h-12 px-7 text-base bg-primary hover:bg-primary/90 active:scale-[0.98] transition-transform"
                >
                  <DiscordMark className="h-5 w-5 mr-2.5" />
                  Discord ile Giriş Yap
                </Button>
                <a
                  href={inviteQuery.data?.url || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-12 px-7 text-base bg-card/60 hover:bg-card active:scale-[0.98] transition-transform"
                    disabled={!inviteQuery.data?.url}
                  >
                    Patrick'u Deneyin →
                  </Button>
                </a>
              </div>
            )}
          </div>
        </section>

        {/* Feature Cards */}
        <section className="grid gap-4 sm:grid-cols-3 pb-24 pt-6">
          <FeatureCard
            icon={<LifeBuoy className="h-5 w-5" />}
            title="Destek Sistemi"
            desc="Artık herkese yardım etmek çok mu zor? Yoksa yardıma mı ihtiyacın var. Bu sistem tam sana göre."
          />
          <FeatureCard
            icon={<Users className="h-5 w-5" />}
            title="Kulüp Sistemi"
            desc="Artık takılacak yeni yerler keşfetmenin zamanı geldi. Kendi kulübünü ve belki çevreni kurmanı sağlayacak."
          />
          <FeatureCard
            icon={<ShieldCheck className="h-5 w-5" />}
            title="Patrick Premium"
            desc="Bu trende bir çok vagon var, ancak bir vagonda sadece gizli üyelere yer var. Yakında vagon açılıyor'"
          />
        </section>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/70 p-5 text-left transition-colors hover:border-primary/40">
      <div className="grid place-items-center h-10 w-10 rounded-lg bg-primary/15 text-primary mb-3">{icon}</div>
      <h3 className="font-semibold mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  );
}

function DiscordMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.317 4.369A19.79 19.79 0 0 0 15.885 3c-.21.375-.45.88-.617 1.28a18.27 18.27 0 0 0-5.535 0A12.6 12.6 0 0 0 9.1 3a19.74 19.74 0 0 0-4.432 1.369C1.86 8.59 1.07 12.7 1.42 16.756A19.94 19.94 0 0 0 7.49 19.84c.49-.67.927-1.38 1.302-2.126-.714-.27-1.397-.604-2.04-.998.171-.126.339-.257.5-.392 3.927 1.84 8.18 1.84 12.06 0 .163.135.33.266.5.392-.644.394-1.327.728-2.041.998.375.746.81 1.456 1.3 2.126a19.9 19.9 0 0 0 6.073-3.084c.41-4.704-.7-8.78-2.927-12.387ZM8.02 14.331c-.974 0-1.773-.892-1.773-1.989 0-1.097.78-1.99 1.773-1.99 1 0 1.79.9 1.773 1.99 0 1.097-.78 1.989-1.773 1.989Zm7.96 0c-.974 0-1.773-.892-1.773-1.989 0-1.097.78-1.99 1.773-1.99 1 0 1.79.9 1.773 1.99 0 1.097-.773 1.989-1.773 1.989Z" />
    </svg>
  );
}
