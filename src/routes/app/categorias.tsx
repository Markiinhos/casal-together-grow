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
import { Tag, Plus, Trash2, Pencil, ChevronDown, ChevronUp, Archive, Globe, Lock } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import * as Collapsible from "@radix-ui/react-collapsible";

export const Route = createFileRoute("/app/categorias")({
  component: CatPage,
});

const PALETTE = ["#FF6B57", "#7B61FF", "#34D399", "#FBBF24", "#60A5FA", "#F472B6", "#A78BFA", "#F87171", "#10B981"];
const ICONS = ["tag", "shopping-cart", "utensils", "home", "car", "heart", "gift", "music", "plane", "book", "coffee", "dumbbell"];

interface Subcat {
  id: string;
  category_id: string;
  name: string;
  icon: string | null;
  color: string | null;
  is_archived: boolean;
  sort_order: number;
}

interface Cat {
  id: string;
  name: string;
  type: string;
  color: string;
  icon: string;
  user_id: string;
  couple_id: string | null;
  visibility: string;
  is_archived: boolean;
  is_default: boolean;
  sort_order: number;
  subcategories?: Subcat[];
}

function CatPage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const coupleId = profile?.couple_id ?? null;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Cat | null>(null);

  const [openSub, setOpenSub] = useState(false);
  const [editingSub, setEditingSub] = useState<{ sub: Subcat | null; catId: string } | null>(null);

  const { data: cats = [] } = useQuery({
    queryKey: ["cats"],
    queryFn: async () => {
      // The RLS policy should automatically filter out what the user can't see, 
      // but to be safe we can let it query.
      const { data, error } = await supabase
        .from("categories")
        .select("*, subcategories(*)")
        .order("sort_order")
        .order("name");
      if (error) console.error("[cats] load", error);
      return (data ?? []) as unknown as Cat[];
    },
    enabled: !!user,
  });

  async function del(id: string) {
    if (!confirm("Excluir categoria?")) return;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Excluída");
      qc.invalidateQueries({ queryKey: ["cats"] });
    }
  }

  async function delSub(id: string) {
    if (!confirm("Excluir subcategoria?")) return;
    const { error } = await supabase.from("subcategories").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Subcategoria excluída");
      qc.invalidateQueries({ queryKey: ["cats"] });
    }
  }

  return (
    <>
      <AppHeader title="Categorias" subtitle="Personalize cores e ícones" />
      <div className="px-4 py-4 space-y-4">
        <Dialog open={open || !!editing} onOpenChange={(o) => { if (!o) { setOpen(false); setEditing(null); } }}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditing(null); setOpen(true); }} className="w-full rounded-xl gradient-coral text-white border-0 h-11 shadow-sm font-medium">
              <Plus className="size-4 mr-1.5" /> Nova categoria
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-3xl border-0 shadow-xl sm:max-w-md">
            <DialogHeader><DialogTitle>{editing ? "Editar categoria" : "Nova categoria"}</DialogTitle></DialogHeader>
            <CatForm
              key={editing?.id ?? "new"}
              editing={editing}
              coupleId={coupleId}
              onDone={() => { setOpen(false); setEditing(null); }}
            />
          </DialogContent>
        </Dialog>

        <Dialog open={openSub || !!editingSub} onOpenChange={(o) => { if (!o) { setOpenSub(false); setEditingSub(null); } }}>
          <DialogContent className="rounded-3xl border-0 shadow-xl sm:max-w-md">
            <DialogHeader><DialogTitle>{editingSub?.sub ? "Editar subcategoria" : "Nova subcategoria"}</DialogTitle></DialogHeader>
            {editingSub && (
               <SubcatForm
                 key={editingSub.sub?.id ?? "newSub"}
                 catId={editingSub.catId}
                 editing={editingSub.sub}
                 onDone={() => { setOpenSub(false); setEditingSub(null); }}
               />
            )}
          </DialogContent>
        </Dialog>

        {cats.length === 0 ? (
          <Card className="rounded-2xl p-4 shadow-card">
            <EmptyState icon={Tag} title="Sem categorias" description="Crie categorias para receitas, despesas, tarefas e metas." />
          </Card>
        ) : (
          <div className="space-y-4">
            {cats.map((c) => (
              <Collapsible.Root key={c.id} className="bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden">
                <Collapsible.Trigger className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-muted/50 transition-colors group">
                  <div className="size-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: c.color + "22", color: c.color }}>
                    <Tag className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="font-semibold text-sm flex items-center gap-1.5">
                      {c.name}
                      {c.visibility === 'shared' ? <Globe className="size-3 text-muted-foreground" /> : <Lock className="size-3 text-muted-foreground" />}
                      {c.is_archived && <Archive className="size-3 text-muted-foreground" />}
                    </div>
                    <div className="text-[11px] text-muted-foreground capitalize mt-0.5">{c.type}</div>
                  </div>
                  {!c.is_default && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setEditing(c); }} className="size-8 rounded-lg text-muted-foreground">
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); del(c.id); }} className="size-8 rounded-lg text-destructive">
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  )}
                  <ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180 ml-2" />
                </Collapsible.Trigger>
                
                <Collapsible.Content className="px-4 pb-3 pt-1 border-t border-border/40 bg-muted/20 space-y-1">
                   {c.subcategories?.map(sub => (
                     <div key={sub.id} className="flex items-center justify-between py-2 px-2 hover:bg-muted rounded-lg group">
                        <div className="flex items-center gap-2 text-sm text-foreground/80">
                          <div className="size-2 rounded-full" style={{ background: sub.color || c.color }} />
                          {sub.name}
                        </div>
                        <div className="flex items-center gap-1 opacity-100 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" onClick={() => { setEditingSub({ sub, catId: c.id }); setOpenSub(true); }} className="size-7 rounded-md">
                            <Pencil className="size-3 text-muted-foreground" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => delSub(sub.id)} className="size-7 rounded-md hover:bg-destructive/10 text-destructive">
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                     </div>
                   ))}
                   {!c.subcategories?.length && <div className="text-xs text-muted-foreground py-2 px-2">Nenhuma subcategoria</div>}
                   <Button variant="ghost" size="sm" onClick={() => { setEditingSub({ sub: null, catId: c.id }); setOpenSub(true); }} className="w-full mt-2 text-xs text-muted-foreground h-8 justify-start">
                     <Plus className="size-3 mr-1" /> Adicionar subcategoria
                   </Button>
                </Collapsible.Content>
              </Collapsible.Root>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function CatForm({ editing, coupleId, onDone }: { editing: Cat | null; coupleId: string | null; onDone: () => void }) {
  const [name, setName] = useState(editing?.name ?? "");
  const [type, setType] = useState(editing?.type ?? "expense");
  const [color, setColor] = useState(editing?.color ?? PALETTE[0]);
  const [icon, setIcon] = useState(editing?.icon ?? ICONS[0]);
  const [visibility, setVisibility] = useState(editing?.visibility ?? "shared");
  const [is_archived, setIsArchived] = useState(editing?.is_archived ?? false);
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();
  const qc = useQueryClient();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    
    // Se for privado, força null no couple_id pra policy deixar inserir como privado
    const actualCoupleId = visibility === "shared" ? coupleId : null;
    
    const payload = { 
       name, 
       type, 
       color, 
       icon,
       visibility,
       is_archived
    };
    
    let error;
    if (editing) {
      ({ error } = await supabase.from("categories").update(payload).eq("id", editing.id));
    } else {
      ({ error } = await supabase.from("categories").insert({
        ...payload,
        user_id: user.id,
        couple_id: actualCoupleId,
      }));
    }
    setSaving(false);
    if (error) {
      console.error("[cats] save", error);
      toast.error(error.message);
    } else {
      toast.success(editing ? "Atualizada!" : "Criada!");
      qc.invalidateQueries({ queryKey: ["cats"] });
      onDone();
    }
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
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-xs">Cor</Label>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {PALETTE.slice(0,6).map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)}
                className={`size-7 rounded-full border-2 transition ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
                style={{ background: c }} />
            ))}
          </div>
        </div>
        <div>
          <Label className="text-xs">Ícone</Label>
          <Select value={icon} onValueChange={setIcon}>
            <SelectTrigger className="mt-1.5 h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ICONS.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {coupleId && (
        <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl border border-border/50">
           <div className="space-y-0.5"><div className="text-sm font-medium">Compartilhado</div><div className="text-xs text-muted-foreground">Visível para o parceiro</div></div>
           <Switch checked={visibility === "shared"} onCheckedChange={(c) => setVisibility(c ? "shared" : "private")} />
        </div>
      )}
      
      {editing && (
        <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl border border-border/50">
           <div className="space-y-0.5"><div className="text-sm font-medium text-destructive">Arquivar</div><div className="text-xs text-muted-foreground">Oculta nas listas principais</div></div>
           <Switch checked={is_archived} onCheckedChange={setIsArchived} />
        </div>
      )}

      <Button type="submit" disabled={saving} className="w-full rounded-xl gradient-coral text-white border-0 h-11 mt-4">
        {saving ? "Salvando..." : editing ? "Atualizar" : "Salvar"}
      </Button>
    </form>
  );
}

function SubcatForm({ catId, editing, onDone }: { catId: string; editing: Subcat | null; onDone: () => void }) {
  const [name, setName] = useState(editing?.name ?? "");
  const [color, setColor] = useState(editing?.color ?? "");
  const [is_archived, setIsArchived] = useState(editing?.is_archived ?? false);
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = { name, color: color || null, is_archived };
    let error;
    if (editing) {
      ({ error } = await supabase.from("subcategories").update(payload).eq("id", editing.id));
    } else {
      ({ error } = await supabase.from("subcategories").insert({ ...payload, category_id: catId }));
    }
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(editing ? "Atualizada!" : "Criada!");
      qc.invalidateQueries({ queryKey: ["cats"] });
      onDone();
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div><Label className="text-sm">Nome da subcategoria</Label><Input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1" /></div>
      <div>
        <Label className="text-xs">Cor personalizada (Opcional)</Label>
        <div className="flex flex-wrap gap-2 mt-1.5">
          <button type="button" onClick={() => setColor("")} className={`size-7 rounded-full border-2 transition flex items-center justify-center text-xs ${!color ? "border-foreground bg-muted" : "border-border bg-transparent"}`}>N</button>
          {PALETTE.slice(0,6).map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)}
              className={`size-7 rounded-full border-2 transition ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
              style={{ background: c }} />
          ))}
        </div>
      </div>
      
      {editing && (
        <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl border border-border/50">
           <div className="space-y-0.5"><div className="text-sm font-medium text-destructive">Arquivar</div><div className="text-xs text-muted-foreground">Oculta nas seleções</div></div>
           <Switch checked={is_archived} onCheckedChange={setIsArchived} />
        </div>
      )}

      <Button type="submit" disabled={saving} className="w-full rounded-xl gradient-coral text-white border-0 h-11 mt-2">
        {saving ? "Salvando..." : editing ? "Atualizar" : "Salvar subcategoria"}
      </Button>
    </form>
  );
}
