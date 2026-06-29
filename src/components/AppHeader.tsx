import { Link } from "@tanstack/react-router";
import { Bell, Settings as SettingsIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { SpaceToggle } from "@/components/SpaceToggle";
import logoAsset from "@/assets/casal-logo.png.asset.json";

export function AppHeader({ title, subtitle, showSpaceToggle = true }: { title?: string; subtitle?: string; showSpaceToggle?: boolean }) {
  const { user } = useAuth();
  const { data: unread = 0 } = useQuery({
    queryKey: ["notif-unread", user?.id],
    queryFn: async () => {
      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("read", false);
      return count ?? 0;
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  return (
    <header className="sticky top-0 z-30 bg-background/85 backdrop-blur border-b border-border">
      <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
        <img src={logoAsset.url} alt="CASAL" className="size-9 rounded-xl" />
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-base truncate">{title ?? "Casal"}</h1>
          {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
        </div>
        <Link to="/app/mais/notificacoes" className="relative size-9 rounded-full hover:bg-accent flex items-center justify-center">
          <Bell className="size-5 text-muted-foreground" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Link>
        <Link to="/app/mais/configuracoes" className="size-9 rounded-full hover:bg-accent flex items-center justify-center">
          <SettingsIcon className="size-5 text-muted-foreground" />
        </Link>
      </div>
      {showSpaceToggle && (
        <div className="max-w-md mx-auto px-4 pb-3 flex justify-center">
          <SpaceToggle />
        </div>
      )}
    </header>
  );
}
