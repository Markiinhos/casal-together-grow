import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile, useCouple, usePartner } from "@/lib/hooks";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/EmptyState";
import { Heart, Plus, Trash2, Sparkles, Trophy } from "lucide-react";
import { CoupleAvatar } from "@/components/CouplePhotoUploader";
import { toast } from "sonner";

export const Route = createFileRoute("/app/casal")({
  component: CasalPage,
});

function CasalPage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { data: couple } = useCouple();
  const { data: partner } = usePartner();
  const coupleId = profile?.couple_id ?? null;
  const qc = useQueryClient();

  const { data: memories = [] } = useQuery({
    queryKey: ["memories", coupleId, user?.id],
    queryFn: async () => {
      const q = supabase.from("memories").select("*").order("memory_date", { ascending: false, nullsFirst: false });
      const { data } = coupleId ? await q.eq("couple_id", coupleId) : await q.eq("user_id", user!.id);
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: wishes = [] } = useQuery({
    queryKey: ["wishes", coupleId, user?.id],
    queryFn: async () => {
      const q = supabase.from("wishes").select("*").order("created_at", { ascending: false });
      const { data } = coupleId ? await q.eq("couple_id", coupleId) : await q.eq("user_id", user!.id);
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: achievements = [] } = useQuery({
    queryKey: ["ach", coupleId, user?.id],
    queryFn: async () => {
      const q = supabase.from("achievements").select("*").order("earned_at", { ascending: false });
      const { data } = coupleId ? await q.eq("couple_id", coupleId) : await q.eq("user_id", user!.id);
      return data ?? [];
    },
    enabled: !!user,
  });

  const [memOpen, setMemOpen] = useState(false);
  const [wishOpen, setWishOpen] = useState(false);

  return (
    <>
      <AppHeader title="Espaço do Casal" subtitle={partner ? `Você + ${partner.full_name?.split(" ")[0] ?? "parceiro"}` : "Memórias e sonhos"} />
      <div className="px-4 py-4 space-y-4">
        {couple && (
          <Card className="rounded-3xl p-5 gradient-coral text-white border-0 shadow-soft">
            <div className="flex items-center gap-4">
              <CoupleAvatar coupleId={couple.id} photoPath={(couple as any).photo_url ?? null} size={72} editable />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-lg truncate">{couple.name ?? "Nosso casal"}</div>
                {couple.start_date && (
                  <div className="text-xs text-white/85">
                    Juntos desde {new Date(couple.start_date).toLocaleDateString("pt-BR")}
                  </div>
                )}
                {partner && <div className="text-xs text-white/85 mt-0.5">Você + {partner.full_name?.split(" ")[0]}</div>}
              </div>
            </div>
          </Card>
        )}

        <Tabs defaultValue="memories">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="memories">Memórias</TabsTrigger>
            <TabsTrigger value="wishes">Sonhos</TabsTrigger>
            <TabsTrigger value="achievements">Conquistas</TabsTrigger>
          </TabsList>

          <TabsContent value="memories" className="mt-4 space-y-3">
            <Dialog open={memOpen} onOpenChange={setMemOpen}>
              <DialogTrigger asChild>
                <Button className="w-full rounded-xl gradient-coral text-white border-0 h-10"><Plus className="size-4 mr-1" /> Nova memória</Button>
              </DialogTrigger>
              <DialogContent className="rounded-3xl">
                <DialogHeader><DialogTitle>Nova memória</DialogTitle></DialogHeader>
                <MemForm onDone={() => setMemOpen(false)} />
              </DialogContent>
            </Dialog>
            {memories.length === 0 ? (
              <Card className="rounded-2xl p-4 shadow-card"><EmptyState icon={Sparkles} title="Sem memórias ainda" description="Registre momentos especiais." /></Card>
            ) : (
              (memories as any[]).map((m) => (
                <Card key={m.id} className="rounded-2xl p-4 shadow-card">
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <div className="font-semibold text-sm">{m.title}</div>
                      {m.memory_date && <div className="text-xs text-muted-foreground">{new Date(m.memory_date).toLocaleDateString("pt-BR")}</div>}
                      {m.description && <p className="text-sm mt-1.5 text-muted-foreground">{m.description}</p>}
                    </div>
                    <button onClick={async () => { await supabase.from("memories").delete().eq("id", m.id); qc.invalidateQueries(); }} className="text-destructive"><Trash2 className="size-4" /></button>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="wishes" className="mt-4 space-y-3">
            <Dialog open={wishOpen} onOpenChange={setWishOpen}>
              <DialogTrigger asChild>
                <Button className="w-full rounded-xl gradient-coral text-white border-0 h-10"><Plus className="size-4 mr-1" /> Novo sonho</Button>
              </DialogTrigger>
              <DialogContent className="rounded-3xl">
                <DialogHeader><DialogTitle>Novo sonho/desejo</DialogTitle></DialogHeader>
                <WishForm onDone={() => setWishOpen(false)} />
              </DialogContent>
            </Dialog>
            {wishes.length === 0 ? (
              <Card className="rounded-2xl p-4 shadow-card"><EmptyState icon={Heart} title="Sem sonhos" description="Adicionem desejos compartilhados." /></Card>
            ) : (
              (wishes as any[]).map((w) => (
                <Card key={w.id} className="rounded-2xl p-4 shadow-card flex items-center gap-3">
                  <input type="checkbox" checked={w.achieved} onChange={async () => {
                    await supabase.from("wishes").update({ achieved: !w.achieved }).eq("id", w.id);
                    qc.invalidateQueries();
                  }} className="size-5 rounded accent-[var(--color-primary)]" />
                  <div className="flex-1">
                    <div className={`font-medium text-sm ${w.achieved ? "line-through text-muted-foreground" : ""}`}>{w.title}</div>
                    {w.description && <div className="text-xs text-muted-foreground">{w.description}</div>}
                  </div>
                  <button onClick={async () => { await supabase.from("wishes").delete().eq("id", w.id); qc.invalidateQueries(); }} className="text-destructive"><Trash2 className="size-4" /></button>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="achievements" className="mt-4 space-y-3">
            {achievements.length === 0 ? (
              <Card className="rounded-2xl p-4 shadow-card"><EmptyState icon={Trophy} title="Sem conquistas ainda" description="Complete metas e desafios para desbloquear." /></Card>
            ) : (
              (achievements as any[]).map((a) => (
                <Card key={a.id} className="rounded-2xl p-4 shadow-card flex items-center gap-3">
                  <div className="size-10 rounded-xl bg-warning/10 flex items-center justify-center">
                    <Trophy className="size-5 text-warning-foreground" />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{a.name}</div>
                    {a.description && <div className="text-xs text-muted-foreground">{a.description}</div>}
                  </div>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function MemForm({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { data: partner } = usePartner();
  const qc = useQueryClient();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from("memories").insert({
      user_id: user.id, couple_id: profile?.couple_id ?? null,
      title, description, memory_date: date || null,
    });
    if (error) { toast.error(error.message); return; }
    const { notifyPartnerMention } = await import("@/lib/mentions");
    await notifyPartnerMention({
      text: `${title} ${description ?? ""}`,
      partnerId: partner?.id ?? null,
      fromName: profile?.full_name ?? null,
      context: "uma memória",
      link: "/app/casal",
    });
    toast.success("Salvo!"); qc.invalidateQueries(); onDone();
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div><Label>Título</Label><Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Viagem para a praia" /></div>
      <div><Label>Data</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      <div><Label>Descrição</Label><Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Use @parceiro para marcar" /></div>
      <Button type="submit" className="w-full rounded-xl gradient-coral text-white border-0 h-11">Salvar</Button>
    </form>
  );
}

function WishForm({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from("wishes").insert({
      user_id: user.id, couple_id: profile?.couple_id ?? null, title, description,
    });
    if (error) toast.error(error.message); else { toast.success("Salvo!"); qc.invalidateQueries(); onDone(); }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div><Label>Título</Label><Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Casa na praia" /></div>
      <div><Label>Descrição</Label><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      <Button type="submit" className="w-full rounded-xl gradient-coral text-white border-0 h-11">Salvar</Button>
    </form>
  );
}
