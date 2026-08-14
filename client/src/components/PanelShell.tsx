import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDiscordAuth } from "@/lib/discord";
import { LogOut, Server, Settings } from "lucide-react";
import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";

/**
 * Shared shell for all authenticated panel pages: a slim top bar with the Patrick
 * brand, primary navigation and the Discord user menu.
 */
export default function PanelShell({ children }: { children: ReactNode }) {
  const { user, logout, isOwner } = useDiscordAuth();
  const [location] = useLocation();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    await logout(); // logout() artık window.location.href = "/" yapıyor
  };

  const navItem = (href: string, label: string, icon: ReactNode) => {
    const active = location === href || (href !== "/servers" && location.startsWith(href));
    return (
      <Link href={href}>
        <span
          className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
          }`}
        >
          {icon}
          {label}
        </span>
      </Link>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          {/* Logo - sol üst */}
          <Link href="/">
            <span className="flex items-center gap-2.5">
              <span className="grid place-items-center h-9 w-9 rounded-xl bg-primary text-primary-foreground font-extrabold shadow-sm overflow-hidden">
                <img
                  src="/Patrick-logo.svg"
                  alt="Patrick"
                  className="h-9 w-9 object-cover"
                  onError={e => {
                    (e.target as HTMLImageElement).style.display = "none";
                    const parent = (e.target as HTMLImageElement).parentElement;
                    if (parent) parent.textContent = "A";
                  }}
                />
              </span>
              <span className="font-semibold tracking-tight text-foreground hidden sm:inline">Patrick Bot Panel</span>
            </span>
          </Link>

          {/* Nav */}
          <nav className="flex items-center gap-1">
            {navItem("/servers", "Sunucular", <Server className="h-4 w-4" />)}
            {isOwner && navItem("/settings", "Bot Ayarları", <Settings className="h-4 w-4" />)}
          </nav>

          {/* Profil dropdown */}
          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-10 gap-2 px-2 hover:bg-accent/60">
                  <Avatar className="h-7 w-7">
                    {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.username} />}
                    <AvatarFallback className="bg-primary/20 text-foreground text-xs">
                      {user.name?.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium hidden sm:inline">{user.name}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{user.name}</span>
                    <span className="text-xs text-muted-foreground">@{user.username}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={handleLogout}
                  disabled={loggingOut}
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  {loggingOut ? "Çıkış yapılıyor…" : "Çıkış Yap"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>
      <main className="flex-1 w-full">{children}</main>
    </div>
  );
}
