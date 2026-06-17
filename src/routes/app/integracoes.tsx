import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Landmark, Smartphone, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/app/integracoes")({ component: IntegrationsPage });

const PROVIDERS = [
  { id: "mercadopago", name: "Mercado Pago", desc: "Saldo, Pix, receitas e despesas", icon: Smartphone, color: "text-[#009EE3]" },
  { id: "nubank", name: "Nubank", desc: "Conta e cartão (em breve)", icon: Landmark, color: "text-[#820AD1]" },
  { id: "inter", name: "Banco Inter", desc: "Em breve", icon: Landmark, color: "text-[#FF7A00]" },
  { id: "bb", name: "Banco do Brasil", desc: "Em breve", icon: Landmark, color: "text-[#FFEF00]" },
  { id: "caixa", name: "Caixa", desc: "Em breve", icon: Landmark, color: "text-[#0066B3]" },
];

function IntegrationsPage() {
  return (
    <>
      <AppHeader title="Conexões bancárias" subtitle="Open Finance" />
      <div className="px-4 py-4 space-y-4">
        <Card className="rounded-2xl p-3 bg-warning/10 border border-warning/30 flex items-start gap-2">
          <AlertCircle className="size-4 text-warning-foreground shrink-0 mt-0.5" />
          <div className="text-xs">
            <div className="font-semibold">Estrutura pronta</div>
            <div className="text-muted-foreground">
              A integração real com o Mercado Pago exige cadastrar uma aplicação em mercadopago.com/developers
              e fornecer Client ID + Client Secret. Quando estiver pronto, peça para conectar.
            </div>
          </div>
        </Card>

        {PROVIDERS.map((p) => (
          <Card key={p.id} className="rounded-3xl p-4 shadow-card flex items-center gap-3">
            <div className={`size-10 rounded-2xl bg-accent/40 flex items-center justify-center ${p.color}`}>
              <p.icon className="size-5" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-sm">{p.name}</div>
              <div className="text-xs text-muted-foreground">{p.desc}</div>
            </div>
            <Badge variant="outline" className="text-[10px]">Em breve</Badge>
          </Card>
        ))}
      </div>
    </>
  );
}
