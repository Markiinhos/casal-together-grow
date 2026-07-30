import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/hooks";
import { useSpace } from "@/lib/space";
import { formatBRL } from "@/lib/finance";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { EmptyState } from "@/components/EmptyState";
import {
  Wallet, Plus, Pencil, Trash2, Eye, EyeOff, Link as LinkIcon, Landmark,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/financas/contas")({
  component: AccountsPage,
});

const TYPES = [
  { value: "checking", label: "Conta corrente" },
  { value: "savings", label: "Poupança" },
  { value: "wallet", label: "Carteira / dinheiro" },
  { value: "investment", label: "Investimento" },
  { value: "other", label: "Outro" },
];

const COLORS = ["#F97066", "#F59E0B", "#10B981", "#3B82F6", "#8B5CF6", "#EC4899", "#64748B"];

interface Acc {
  id: string;
  name: string | null;
  type: string | null;
  balance: number | null;
  hidden: boolean;
  visibility: string;
  source: string;
  color: string | null;
  connection_id: string | null;
  user_id: string;
  couple_id: string | null;
}

function AccountsPage() {
  const { user, loading: loadingAuth } = useAuth();
  const { data: profile, isLoading: isLoadingProfile } = useProfile();
  const { space } = useSpace();
  const coupleId = profile?.couple_id ?? null;
  const qc = useQueryClient();

  const [editing, setEditing] = useState<Acc | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: accounts = [], isPending } = useQuery({
    queryKey: ["bank_accounts_crud", space, coupleId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      let q: any = supabase
        .from("bank_accounts")
        .select("id,name,type,balance,hidden,visibility,source,color,connection_id,user_id,couple_id")
        .order("created_at");
      if (space === "private") {
        q = q.eq("visibility", "private").eq("user_id", user!.id);
      } else if (coupleId) {
        q = q.eq("visibility", "shared").eq("couple_id", coupleId);
      } else {
        q = q.eq("visibility", "shared").eq("user_id", user!.id);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Acc[];
    },
  });

  async function toggleHidden(a: Acc) {
    await supabase.from("bank_accounts").update({ hidden: !a.hidden }).eq("id", a.id);
    qc.invalidateQueries({ queryKey: ["bank_accounts_crud"] });
    qc.invalidateQueries({ queryKey: ["accounts"] });
  }

  async function del(a: Acc) {
    if (a.source === "pluggy") {
      toast.error("Contas sincronizadas devem ser removidas pela integração bancária.");
      return;
    }
    if (!confirm(`Excluir a conta "${a.name ?? "sem nome"}"? Lançamentos vinculados perderão a referência.`)) return;
    const { error } = await supabase.from("bank_accounts").delete().eq("id", a.id);
    if (error) return toast.error(error.message);
    toast.success("Conta excluída.");
    qc.invalidateQueries({ queryKey: ["bank_accounts_crud"] });
    qc.invalidateQueries({ queryKey: ["accounts"] });
  }

  const visible = accounts.filter((a) => !a.hidden);
  const hidden = accounts.filter((a) => a.hidden);
  const total = visible.reduce((s, a) => s + Number(a.balance ?? 0), 0);

  if (loadingAuth || isLoadingProfile) {
    return (
      <div className="flex flex-col h-[50vh] items-center justify-center text-muted-foreground gap-3">
        <div className="size-12 rounded-full animate-pulse bg-muted" />
        <span className="text-sm font-medium">Carregando contas...</span>
      </div>
    );
  }

  return (
    <>
      <AppHeader title="Contas bancárias" subtitle="Saldos e contas manuais" />
      <div className="px-4 py-4 space-y-4 pb-24">
        <Card className="rounded-3xl p-4 shadow-card">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">Saldo total visível</div>
              <div className="text-2xl font-bold">{formatBRL(total)}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {visible.length} conta(s) ativa(s){hidden.length > 0 && ` · ${hidden.length} oculta(s)`}
              </div>
            </div>
            <Button
              onClick={() => setCreating(true)}
              className="rounded-xl gradient-coral text-white border-0 h-10"
            >
              <Plus className="size-4 mr-1" /> Nova
            </Button>
          </div>
        </Card>

        {isPending ? (
          <Card className="rounded-2xl p-6 text-center text-sm text-muted-foreground">
            Carregando…
          </Card>
        ) : accounts.length === 0 ? (
          <Card className="rounded-2xl p-4 shadow-card">
            <EmptyState
              icon={Wallet}
              title="Nenhuma conta cadastrada"
              description="Adicione uma conta manual ou conecte seu banco pela tela de integrações."
              action={
                <div className="flex gap-2 justify-center">
                  <Button onClick={() => setCreating(true)} className="rounded-xl">
                    <Plus className="size-4 mr-1" /> Manual
                  </Button>
                  <Button asChild variant="outline" className="rounded-xl">
                    <Link to="/app/integracoes">
                      <LinkIcon className="size-4 mr-1" /> Conectar banco
                    </Link>
                  </Button>
                </div>
              }
            />
          </Card>
        ) : (
          <Card className="rounded-3xl divide-y divide-border shadow-card overflow-hidden">
            {accounts.map((a) => (
              <div key={a.id} className="px-4 py-3 flex items-center gap-3">
                <div
                  className="size-10 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: (a.color ?? "#64748B") + "22", color: a.color ?? "#64748B" }}
                >
                  <Landmark className="size-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className={`font-medium text-sm truncate ${a.hidden ? "text-muted-foreground line-through" : ""}`}>
                      {a.name ?? "Sem nome"}
                    </div>
                    {a.source === "pluggy" && (
                      <span className="text-[10px] uppercase bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
                        Sync
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {TYPES.find((t) => t.value === a.type)?.label ?? a.type ?? "—"}
                  </div>
                </div>
                <div className="text-sm font-semibold tabular-nums">
                  {formatBRL(Number(a.balance ?? 0))}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleHidden(a)}
                    className="text-muted-foreground hover:text-foreground p-1.5"
                    title={a.hidden ? "Mostrar" : "Ocultar"}
                  >
                    {a.hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                  <button
                    onClick={() => setEditing(a)}
                    className="text-muted-foreground hover:text-foreground p-1.5"
                    title="Editar"
                  >
                    <Pencil className="size-4" />
                  </button>
                  {a.source !== "pluggy" && (
                    <button
                      onClick={() => del(a)}
                      className="text-destructive p-1.5"
                      title="Excluir"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>

      <AccountFormDialog
        open={creating || !!editing}
        editing={editing}
        onOpenChange={(o) => {
          if (!o) { setCreating(false); setEditing(null); }
        }}
      />
    </>
  );
}

function AccountFormDialog({
  open, editing, onOpenChange,
}: { open: boolean; editing: Acc | null; onOpenChange: (o: boolean) => void }) {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { space } = useSpace();
  const coupleId = profile?.couple_id ?? null;
  const qc = useQueryClient();

  const [name, setName] = useState(editing?.name ?? "");
  const [type, setType] = useState(editing?.type ?? "checking");
  const [balance, setBalance] = useState(editing?.balance != null ? String(editing.balance) : "");
  const [color, setColor] = useState(editing?.color ?? COLORS[0]);
  const [saving, setSaving] = useState(false);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "");
      setType(editing?.type ?? "checking");
      setBalance(editing?.balance != null ? String(editing.balance) : "");
      setColor(editing?.color ?? COLORS[0]);
    }
  }, [open, editing]);

  const isPluggy = editing?.source === "pluggy";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!name.trim()) return toast.error("Informe um nome.");
    setSaving(true);
    try {
      const parsedBalance = balance.trim() === "" ? 0 : Number(balance.replace(",", "."));
      if (Number.isNaN(parsedBalance)) throw new Error("Saldo inválido.");

      if (editing) {
        const patch: any = { name: name.trim(), type, color };
        // Bloqueia edição de saldo/tipo em contas sincronizadas
        if (!isPluggy) patch.balance = parsedBalance;
        const { error } = await supabase.from("bank_accounts").update(patch).eq("id", editing.id);
        if (error) throw error;
        toast.success("Conta atualizada.");
      } else {
        const insertVisibility = space === "private" ? "private" : "shared";
        const insertCoupleId = insertVisibility === "shared" ? coupleId : null;
        const { error } = await supabase.from("bank_accounts").insert({
          user_id: user.id,
          couple_id: insertCoupleId,
          visibility: insertVisibility,
          name: name.trim(),
          type,
          balance: parsedBalance,
          color,
          source: "manual",
          hidden: false,
        } as never);
        if (error) throw error;
        toast.success("Conta criada.");
      }
      qc.invalidateQueries({ queryKey: ["bank_accounts_crud"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar conta" : "Nova conta manual"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {isPluggy && (
            <div className="text-xs bg-primary/10 text-primary p-2 rounded-lg">
              Conta sincronizada — saldo e tipo são gerenciados pela integração.
            </div>
          )}
          <div>
            <Label>Nome</Label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Nubank" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={type ?? "checking"} onValueChange={setType} disabled={isPluggy}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Saldo atual</Label>
              <Input
                type="number" step="0.01"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                disabled={isPluggy}
                placeholder="0,00"
              />
            </div>
          </div>
          <div>
            <Label>Cor</Label>
            <div className="flex gap-2 mt-1 flex-wrap">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`size-7 rounded-full border-2 transition ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
                  style={{ backgroundColor: c }}
                  aria-label={`Cor ${c}`}
                />
              ))}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving} className="gradient-coral text-white border-0">
              {saving ? "Salvando…" : editing ? "Salvar" : "Criar conta"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
