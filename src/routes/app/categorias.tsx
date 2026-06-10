import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/hooks";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { EmptyState } from "@/components/EmptyState";
import { Tag, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/categorias")({
  component: CatPage,
});

const PALETTE = ["#FF6B57", "#7B61FF", "#34D399", "#FBBF24", "#60A5FA", "#F472B6", "#A78BFA"];
const ICONS = ["tag", "shopping-cart", "utensils", "home", "car", "heart", "gift", "music", "plane", "book"];

function CatPage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const coupleId = profile?.couple_id ?? null;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: cats = [] } = useQuery({
    queryKey: ["cats", coupleId, user?.id],
    queryFn: async () => {
      const q = supabase.from("categories").select("*").order("name");
      const { data } = coupleId ? await q.eq("couple_id", coupleId) : await q.eq("user_id", user!.id);
      return data ?? [];
    },
    enabled: !!user,
  });

  async function del(id: string) {
    if (!confirm("Excluir categoria?")) return;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) toast.error(error.message); else qc.invalidateQueries();
  }

  return (
    <>
      <AppHeader title="Categorias" subtitle="Personalize cores e ícones" />
      <div className="px-4 py-4 space-y-4">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="w-full rounded-xl gradient-coral text-white border-0 h-11">
              <Plus className="size-4 mr-1" /> Nova categoria
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-3xl">
            <DialogHeader><DialogTitle>Nova categoria</DialogTitle></DialogHeader>
            <CatForm onDone={() => setOpen(false)} />
          </DialogContent>
        </Dialog>

        {cats.length === 0 ? (
          <Card className="rounded-2xl p-4 shadow-card">
            <EmptyState icon={Tag} title="Sem categorias" description="Crie categorias para receitas, despesas, tarefas e metas." />
          </Card>
        ) : (
          <Card className="rounded-3xl divide-y divide-border shadow-card overflow-hidden">
            {(cats as any[]).map((c) => (
              <div key={c.id} className="px-4 py-3 flex items-center gap-3">
                <div className="size-10 rounded-xl flex items-center justify-center" style={{ background: c.color + "22", color: c.color }}>
                  <Tag className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{c.name}</div>
                  <div className="text-xs text-muted-foreground capitalize">{c.type}</div>
                </div>
                <button onClick={() => del(c.id)} className="size-8 rounded-lg hover:bg-destructive/10 text-destructive flex items-center justify-center">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </Card>
        )}
      </div>
    </>
  );
}

function CatForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("expense");
  const [color, setColor] = useState(PALETTE[0]);
  const [icon, setIcon] = useState(ICONS[0]);
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const qc = useQueryClient();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from("categories").insert({
      user_id: user.id, couple_id: profile?.couple_id ?? null, name, type, color, icon,
    });
    if (error) toast.error(error.message);
    else { toast.success("Criada!"); qc.invalidateQueries(); onDone(); }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div><Label>Nome</Label><Input required value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div>
        <Label>Tipo</Label>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="expense">Despesa</SelectItem>
            <SelectItem value="income">Receita</SelectItem>
            <SelectItem value="task">Tarefa</SelectItem>
            <SelectItem value="goal">Meta</SelectItem>
            <SelectItem value="other">Outro</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Cor</Label>
        <div className="flex flex-wrap gap-2 mt-1.5">
          {PALETTE.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)}
              className={`size-8 rounded-full border-2 ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
              style={{ background: c }} />
          ))}
        </div>
      </div>
      <div>
        <Label>Ícone</Label>
        <Select value={icon} onValueChange={setIcon}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {ICONS.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" className="w-full rounded-xl gradient-coral text-white border-0 h-11">Salvar</Button>
    </form>
  );
}
