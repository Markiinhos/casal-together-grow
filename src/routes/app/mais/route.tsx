import { createFileRoute, Link, Outlet, useMatchRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Wallet, ListChecks, Target, Tag, Heart, User, Bell, Settings as SettingsIcon, LogOut, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app/mais")({
  component: MaisLayout,
});

const items = [
  { to: "/app/financas", icon: Wallet, label: "Finanças", color: "text-primary", bg: "bg-primary/10" },
  { to: "/app/tarefas", icon: ListChecks, label: "Tarefas da casa", color: "text-accent-purple", bg: "bg-accent-purple/10" },
  { to: "/app/metas", icon: Target, label: "Metas", color: "text-success", bg: "bg-success/10" },
  { to: "/app/categorias", icon: Tag, label: "Categorias", color: "text-warning-foreground", bg: "bg-warning/10" },
  { to: "/app/desafios", icon: Trophy, label: "Desafios", color: "text-accent-purple", bg: "bg-accent-purple/10" },
  { to: "/app/parceiro", icon: Heart, label: "Parceiro(a)", color: "text-primary", bg: "bg-primary/10" },
  { to: "/app/mais/notificacoes", icon: Bell, label: "Notificações", color: "text-foreground", bg: "bg-muted" },
  { to: "/app/mais/configuracoes", icon: SettingsIcon, label: "Configurações", color: "text-foreground", bg: "bg-muted" },
];

function MaisLayout() {
  const matchRoute = useMatchRoute();
  const isChild = matchRoute({ to: "/app/mais", fuzzy: true }) && !matchRoute({ to: "/app/mais" });
  if (isChild) return <Outlet />;
  return (
    <>
      <AppHeader title="Mais" subtitle="Tudo do app" />
      <div className="px-4 py-4 space-y-2">
        <Card className="rounded-3xl divide-y divide-border shadow-card overflow-hidden">
          {items.map((it) => (
            <Link key={it.to} to={it.to} className="px-4 py-3.5 flex items-center gap-3 hover:bg-accent transition-colors">
              <div className={`size-10 rounded-xl flex items-center justify-center ${it.bg} ${it.color}`}>
                <it.icon className="size-5" />
              </div>
              <span className="flex-1 font-medium text-sm">{it.label}</span>
              <span className="text-muted-foreground">›</span>
            </Link>
          ))}
        </Card>
        <button onClick={() => supabase.auth.signOut()} className="w-full rounded-2xl py-3.5 text-destructive font-medium flex items-center justify-center gap-2 hover:bg-destructive/5">
          <LogOut className="size-4" /> Sair
        </button>
      </div>
    </>
  );
}
