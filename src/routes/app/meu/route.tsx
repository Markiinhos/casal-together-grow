import { createFileRoute, Link, Outlet, useMatchRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { ListChecks, Calendar, Target, Wallet, HeartPulse, Activity } from "lucide-react";
import { useSpace } from "@/lib/space";

export const Route = createFileRoute("/app/meu")({
  component: MeuLayout,
});

const items = [
  { to: "/app/tarefas", icon: ListChecks, label: "Minhas Tarefas", bg: "bg-accent-purple/10", color: "text-accent-purple" },
  { to: "/app/agenda", icon: Calendar, label: "Minha Agenda", bg: "bg-primary/10", color: "text-primary" },
  { to: "/app/metas", icon: Target, label: "Minhas Metas", bg: "bg-success/10", color: "text-success" },
  { to: "/app/financas", icon: Wallet, label: "Minhas Finanças", bg: "bg-primary/10", color: "text-primary" },
  { to: "/app/rotina", icon: Activity, label: "Meus Hábitos", bg: "bg-warning/10", color: "text-warning-foreground" },
  { to: "/app/saude", icon: HeartPulse, label: "Minha Saúde", bg: "bg-destructive/10", color: "text-destructive" },
];

function MeuLayout() {
  const matchRoute = useMatchRoute();
  const isChild = matchRoute({ to: "/app/meu", fuzzy: true }) && !matchRoute({ to: "/app/meu" });
  const { setSpace } = useSpace();
  useEffect(() => { setSpace("private"); }, [setSpace]);
  if (isChild) return <Outlet />;
  return (
    <>
      <AppHeader title="Meu Espaço" subtitle="Seu canto privado" />
      <div className="px-4 py-4">
        <div className="grid grid-cols-2 gap-3">
          {items.map((it) => (
            <Link key={it.to} to={it.to}>
              <Card className="rounded-3xl p-4 shadow-card hover:shadow-soft transition-shadow">
                <div className={`size-11 rounded-2xl flex items-center justify-center ${it.bg} ${it.color} mb-3`}>
                  <it.icon className="size-5" />
                </div>
                <div className="font-semibold text-sm">{it.label}</div>
                <div className="text-xs text-muted-foreground mt-1">Apenas você vê</div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
