import { createFileRoute, Link, Outlet, useMatchRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Wallet, Calendar, Target, Utensils, ShoppingBasket, Home as HomeIcon, Heart, Sparkles } from "lucide-react";
import { useSpace } from "@/lib/space";

export const Route = createFileRoute("/app/nosso")({
  component: NossoLayout,
});

const items = [
  { to: "/app/financas", icon: Wallet, label: "Finanças do Casal", bg: "bg-primary/10", color: "text-primary" },
  { to: "/app/agenda", icon: Calendar, label: "Agenda", bg: "bg-accent-purple/10", color: "text-accent-purple" },
  { to: "/app/metas", icon: Target, label: "Metas", bg: "bg-success/10", color: "text-success" },
  { to: "/app/cardapio", icon: Utensils, label: "Cardápio", bg: "bg-success/10", color: "text-success" },
  { to: "/app/compras", icon: ShoppingBasket, label: "Lista de Compras", bg: "bg-warning/10", color: "text-warning-foreground" },
  { to: "/app/tarefas", icon: HomeIcon, label: "Tarefas da Casa", bg: "bg-accent-purple/10", color: "text-accent-purple" },
  { to: "/app/dates", icon: Heart, label: "Dates", bg: "bg-primary/10", color: "text-primary" },
  { to: "/app/casal", icon: Sparkles, label: "Memórias", bg: "bg-warning/10", color: "text-warning-foreground" },
];

function NossoLayout() {
  const matchRoute = useMatchRoute();
  const isChild = matchRoute({ to: "/app/nosso", fuzzy: true }) && !matchRoute({ to: "/app/nosso" });
  const { setSpace } = useSpace();
  useEffect(() => { setSpace("shared"); }, [setSpace]);
  if (isChild) return <Outlet />;
  return (
    <>
      <AppHeader title="Nosso Espaço" subtitle="Vida a dois" />
      <div className="px-4 py-4">
        <div className="grid grid-cols-2 gap-3">
          {items.map((it) => (
            <Link key={it.to} to={it.to}>
              <Card className="rounded-3xl p-4 shadow-card hover:shadow-soft transition-shadow">
                <div className={`size-11 rounded-2xl flex items-center justify-center ${it.bg} ${it.color} mb-3`}>
                  <it.icon className="size-5" />
                </div>
                <div className="font-semibold text-sm">{it.label}</div>
                <div className="text-xs text-muted-foreground mt-1">Compartilhado</div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
