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
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { EmptyState } from "@/components/EmptyState";
import { ShoppingBasket, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/compras")({ component: ShoppingPage });

const CATS: Record<string, string> = {
  mercado: "Mercado", hortifruti: "Hortifruti", acougue: "Açougue", farmacia: "Farmácia", outros: "Outros",
};

function ShoppingPage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const coupleId = profile?.couple_id ?? null;
  const qc = useQueryClient();

  const { data: items = [] } = useQuery({
    queryKey: ["shopping", coupleId, user?.id],
    queryFn: async () => {
      const q = supabase.from("shopping_items").select("*").order("checked").order("created_at", { ascending: false });
      const { data } = coupleId ? await q.eq("couple_id", coupleId) : await q.eq("user_id", user!.id);
      return (data ?? []) as any[];
    },
    enabled: !!user,
  });

  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [cat, setCat] = useState("mercado");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !name) return;
    const { error } = await supabase.from("shopping_items").insert({
      user_id: user.id, couple_id: coupleId, name, quantity: qty, category: cat,
    });
    if (error) toast.error(error.message);
    else { setName(""); setQty(""); qc.invalidateQueries({ queryKey: ["shopping"] }); }
  }
  async function toggle(it: any) {
    await supabase.from("shopping_items").update({ checked: !it.checked }).eq("id", it.id);
    qc.invalidateQueries({ queryKey: ["shopping"] });
  }
  async function del(id: string) {
    await supabase.from("shopping_items").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["shopping"] });
  }
  async function clearChecked() {
    if (!confirm("Limpar itens marcados?")) return;
    const ids = items.filter((i) => i.checked).map((i) => i.id);
    if (ids.length) {
      await supabase.from("shopping_items").delete().in("id", ids);
      qc.invalidateQueries({ queryKey: ["shopping"] });
    }
  }

  const grouped: Record<string, any[]> = {};
  items.forEach((i) => { (grouped[i.category] = grouped[i.category] ?? []).push(i); });

  return (
    <>
      <AppHeader title="Lista de compras" />
      <div className="px-4 py-4 space-y-4">
        <form onSubmit={add} className="flex gap-2">
          <Input placeholder="Item" value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
          <Input placeholder="Qtd" value={qty} onChange={(e) => setQty(e.target.value)} className="w-16" />
          <Select value={cat} onValueChange={setCat}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(CATS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
          <Button type="submit" size="icon" className="rounded-xl gradient-coral text-white border-0"><Plus className="size-4" /></Button>
        </form>

        {items.some((i) => i.checked) && (
          <Button variant="ghost" onClick={clearChecked} className="text-destructive">Limpar marcados</Button>
        )}

        {items.length === 0 ? (
          <Card className="rounded-2xl p-4 shadow-card">
            <EmptyState icon={ShoppingBasket} title="Lista vazia" description="Adicione itens ou gere a partir do cardápio." />
          </Card>
        ) : (
          Object.entries(grouped).map(([cat, list]) => (
            <Card key={cat} className="rounded-3xl shadow-card overflow-hidden">
              <div className="px-4 py-2 bg-accent/30 font-semibold text-xs uppercase tracking-wide">{CATS[cat] ?? cat}</div>
              <div className="divide-y divide-border">
                {list.map((it) => (
                  <div key={it.id} className="px-4 py-2.5 flex items-center gap-3">
                    <input type="checkbox" checked={it.checked} onChange={() => toggle(it)} className="size-5 accent-primary" />
                    <div className={`flex-1 text-sm ${it.checked ? "line-through text-muted-foreground" : ""}`}>
                      {it.name} {it.quantity && <span className="text-xs text-muted-foreground">({it.quantity})</span>}
                    </div>
                    <button onClick={() => del(it.id)} className="text-destructive"><Trash2 className="size-4" /></button>
                  </div>
                ))}
              </div>
            </Card>
          ))
        )}
      </div>
    </>
  );
}
