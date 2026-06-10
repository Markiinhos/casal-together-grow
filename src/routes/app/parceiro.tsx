import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile, useCouple, usePartner } from "@/lib/hooks";
import { createCouple, joinCoupleByCode } from "@/lib/couple";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Copy, Heart, LinkIcon, UserPlus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/parceiro")({
  component: ParceiroPage,
});

function ParceiroPage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { data: couple } = useCouple();
  const { data: partner } = usePartner();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  async function handleCreate() {
    if (!user) return;
    try {
      await createCouple(name || null, user.id);
      toast.success("Casal criado!");
      qc.invalidateQueries();
    } catch (e: any) { toast.error(e.message); }
  }
  async function handleJoin() {
    if (!user) return;
    try {
      await joinCoupleByCode(code, user.id);
      toast.success("Vinculado!");
      qc.invalidateQueries();
    } catch (e: any) { toast.error(e.message); }
  }
  async function leave() {
    if (!user || !confirm("Sair do casal? Você manterá apenas seus dados pessoais.")) return;
    await supabase.from("profiles").update({ couple_id: null }).eq("id", user.id);
    qc.invalidateQueries();
    toast.success("Você saiu do casal");
  }
  function copyInvite() {
    if (!couple) return;
    const url = `${window.location.origin}/convite/${couple.invite_code}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copiado!");
  }

  return (
    <>
      <header className="sticky top-0 z-30 bg-background/85 backdrop-blur border-b border-border">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/app/mais" className="size-9 rounded-full hover:bg-accent flex items-center justify-center">
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="font-bold">Parceiro(a)</h1>
        </div>
      </header>

      <div className="px-4 py-4 space-y-4">
        {couple ? (
          <>
            <Card className="rounded-3xl p-5 gradient-coral text-white border-0 shadow-soft">
              <div className="flex items-center gap-3 mb-3">
                <Heart className="size-6" fill="currentColor" />
                <div>
                  <div className="font-bold">{couple.name ?? "Nosso casal"}</div>
                  <div className="text-xs text-white/85">{partner ? `Conectado com ${partner.full_name ?? ""}` : "Aguardando parceiro"}</div>
                </div>
              </div>
              {!partner && (
                <div className="bg-white/15 rounded-2xl p-3">
                  <div className="text-xs text-white/85 mb-1">Compartilhe este código:</div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 font-mono text-lg font-bold tracking-wider">{couple.invite_code}</code>
                    <button onClick={copyInvite} className="size-8 rounded-lg bg-white/20 flex items-center justify-center">
                      <Copy className="size-4" />
                    </button>
                  </div>
                  <Button onClick={copyInvite} className="w-full mt-2 bg-white text-primary hover:bg-white/90 rounded-xl">
                    <LinkIcon className="size-4 mr-1.5" /> Copiar link do convite
                  </Button>
                </div>
              )}
            </Card>
            <Button variant="outline" onClick={leave} className="w-full rounded-xl text-destructive border-destructive/30">Sair do casal</Button>
          </>
        ) : (
          <>
            <Card className="rounded-3xl p-5 shadow-card">
              <div className="flex items-center gap-2 mb-3">
                <UserPlus className="size-5 text-primary" />
                <h3 className="font-semibold">Criar um casal</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-3">Você gera um código para convidar seu parceiro.</p>
              <Label>Nome do casal (opcional)</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: João & Maria" className="mb-3" />
              <Button onClick={handleCreate} className="w-full rounded-xl gradient-coral text-white border-0">Criar casal</Button>
            </Card>
            <Card className="rounded-3xl p-5 shadow-card">
              <div className="flex items-center gap-2 mb-3">
                <Heart className="size-5 text-primary" />
                <h3 className="font-semibold">Entrar em um casal</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-3">Use o código que seu parceiro compartilhou.</p>
              <Label>Código de convite</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="abc123def456" className="mb-3 font-mono" />
              <Button onClick={handleJoin} variant="outline" className="w-full rounded-xl">Vincular</Button>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
