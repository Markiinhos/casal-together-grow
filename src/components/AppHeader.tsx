import { Link } from "@tanstack/react-router";
import { Bell, Settings as SettingsIcon } from "lucide-react";
import logoAsset from "@/assets/casal-logo.png.asset.json";

export function AppHeader({ title, subtitle }: { title?: string; subtitle?: string }) {
  return (
    <header className="sticky top-0 z-30 bg-background/85 backdrop-blur border-b border-border">
      <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
        <img src={logoAsset.url} alt="CASAL" className="size-9 rounded-xl" />
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-base truncate">{title ?? "Casal"}</h1>
          {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
        </div>
        <Link to="/app/mais/notificacoes" className="size-9 rounded-full hover:bg-accent flex items-center justify-center">
          <Bell className="size-5 text-muted-foreground" />
        </Link>
        <Link to="/app/mais/configuracoes" className="size-9 rounded-full hover:bg-accent flex items-center justify-center">
          <SettingsIcon className="size-5 text-muted-foreground" />
        </Link>
      </div>
    </header>
  );
}
