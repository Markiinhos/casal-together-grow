import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/hooks";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/mais/configuracoes")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const [fullName, setFullName] = useState("");

  useEffect(() => { if (profile) setFullName(profile.full_name ?? ""); }, [profile]);

  const { data: settings } = useQuery({
    queryKey: ["settings", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("settings").select("*").eq("user_id", user!.id).maybeSingle();
      return data ?? { user_id: user!.id, language: "pt-BR", currency: "BRL", notify_agenda: true, notify_goals: true, notify_finance: true, notify_tasks: true, notify_challenges: true };
    },
    enabled: !!user,
  });

  async function updateProfile() {
    if (!user) return;
    const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", user.id);
    if (error) toast.error(error.message); else { toast.success("Perfil atualizado"); qc.invalidateQueries(); }
  }
  async function updateSetting(key: string, value: any) {
    if (!user) return;
    await supabase.from("settings").upsert({ user_id: user.id, ...settings, [key]: value });
    qc.invalidateQueries();
  }

  return (
    <>
      <header className="sticky top-0 z-30 bg-background/85 backdrop-blur border-b border-border">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/app/mais" className="size-9 rounded-full hover:bg-accent flex items-center justify-center"><ArrowLeft className="size-5" /></Link>
          <h1 className="font-bold">Configurações</h1>
        </div>
      </header>
      <div className="px-4 py-4 space-y-4">
        <Card className="rounded-3xl p-5 shadow-card space-y-3">
          <h3 className="font-semibold">Perfil</h3>
          <div><Label>Nome</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
          <div><Label>E-mail</Label><Input value={user?.email ?? ""} disabled /></div>
          <Button onClick={updateProfile} className="w-full rounded-xl gradient-coral text-white border-0">Salvar</Button>
        </Card>

        <Card className="rounded-3xl p-5 shadow-card space-y-3">
          <h3 className="font-semibold">Preferências</h3>
          <div>
            <Label>Idioma</Label>
            <Select value={settings?.language ?? "pt-BR"} onValueChange={(v) => updateSetting("language", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pt-BR">Português (BR)</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="es">Español</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Moeda</Label>
            <Select value={settings?.currency ?? "BRL"} onValueChange={(v) => updateSetting("currency", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="BRL">Real (BRL)</SelectItem>
                <SelectItem value="USD">Dólar (USD)</SelectItem>
                <SelectItem value="EUR">Euro (EUR)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>

        <Card className="rounded-3xl p-5 shadow-card space-y-3">
          <h3 className="font-semibold">Notificações</h3>
          {[
            { k: "notify_agenda", label: "Agenda" },
            { k: "notify_goals", label: "Metas" },
            { k: "notify_finance", label: "Finanças" },
            { k: "notify_tasks", label: "Tarefas" },
            { k: "notify_challenges", label: "Desafios" },
          ].map((it) => (
            <div key={it.k} className="flex items-center justify-between">
              <span className="text-sm">{it.label}</span>
              <Switch checked={!!settings?.[it.k as keyof typeof settings]} onCheckedChange={(v) => updateSetting(it.k, v)} />
            </div>
          ))}
        </Card>

        <Button variant="outline" onClick={() => supabase.auth.signOut()} className="w-full rounded-xl text-destructive border-destructive/30">
          Sair da conta
        </Button>
      </div>
    </>
  );
}
