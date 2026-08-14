import { trpc } from "@/lib/trpc";

/** Redirect the browser to the Discord OAuth login, encoding the current origin
 * so the backend can build the exact redirect_uri Discord requires. */
export function startDiscordLogin() {
  const origin = window.location.origin;
  window.location.href = `/api/discord/login?origin=${encodeURIComponent(origin)}`;
}

export type DiscordMe = {
  discordId: string;
  username: string;
  name: string;
  avatar: string | null;
  avatarUrl: string | null;
  isOwner: boolean;
};

/** Hook exposing the Discord-authenticated user and a logout helper. */
export function useDiscordAuth() {
  const utils = trpc.useUtils();
  const meQuery = trpc.discord.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const logoutMutation = trpc.discord.logout.useMutation({
    onSuccess: () => {
      utils.discord.me.setData(undefined, null);
    },
  });
  return {
    user: meQuery.data ?? null,
    loading: meQuery.isLoading,
    isAuthenticated: Boolean(meQuery.data),
    isOwner: Boolean(meQuery.data?.isOwner),
    refetch: () => meQuery.refetch(),
    logout: async () => {
      await logoutMutation.mutateAsync().catch(() => {});
      utils.discord.me.setData(undefined, null);
      await utils.discord.me.invalidate();
      // Çıkış yapıldıktan sonra ana sayfaya yönlendir
      window.location.href = "/";
    },
  };
}
