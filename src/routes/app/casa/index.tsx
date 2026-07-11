import { createFileRoute, Link } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Home, ShoppingCart } from "lucide-react";

export const Route = createFileRoute("/app/casa/")({
  component: CasaHub,
});

function CasaHub() {
  return (
    <>
      <AppHeader title="Casa" subtitle="Tudo do lar" />
      <div className="px-4 py-4 space-y-3">
        <Link to="/app/casa/compras">
          <Card className="rounded-3xl p-5 flex items-center gap-4 shadow-card">
            <div className="size-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <ShoppingCart className="size-6" />
            </div>
            <div className="flex-1">
              <div className="font-semibold">Compras para Casa</div>
              <div className="text-xs text-muted-foreground">Planeje compras, melhorias e manutenções do lar.</div>
            </div>
            <span className="text-muted-foreground">›</span>
          </Card>
        </Link>
        <Card className="rounded-3xl p-5 flex items-center gap-4 shadow-card opacity-60">
          <div className="size-12 rounded-2xl bg-muted text-muted-foreground flex items-center justify-center">
            <Home className="size-6" />
          </div>
          <div className="flex-1">
            <div className="font-semibold">Mais módulos em breve</div>
            <div className="text-xs text-muted-foreground">Inventário, contas do lar e mais.</div>
          </div>
        </Card>
      </div>
    </>
  );
}
