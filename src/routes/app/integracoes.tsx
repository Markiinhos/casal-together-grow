import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Landmark, Plus, RefreshCw, Trash2, ShieldCheck, Eye, EyeOff, Search, ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { useServerFn } from "@tanstack/react-start";
const PluggyConnect = lazy(() => import("react-pluggy-connect").then(m => ({ default: m.PluggyConnect })));
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  createPluggyConnectToken,
  savePluggyItem,
  syncPluggyConnection,
  deletePluggyConnection,
  syncInstitutions,
} from "@/lib/pluggy.functions";

export const Route = createFileRoute("/app/integracoes")({ component: IntegrationsPage });

type Conn = {
  id: string;
  institution_name: string | null;
  institution_logo: string | null;
  status: string | null;
  last_synced_at: string | null;
};
type Acc = { id: string; name: string | null; type: string | null; balance: number; hidden: boolean; user_id: string };
type Inst = {
  id: string;
  pluggy_institution_id: string | null;
  name: string;
  image_url: string | null;
  primary_color: string | null;
  type: string | null;
};

const CATEGORIES: { key: string; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "bank", label: "Bancos" },
  { key: "wallet", label: "Carteiras" },
  { key: "investments", label: "Investimentos" },
  { key: "cooperative", label: "Cooperativas" },
  { key: "credit", label: "Crédito" },
];

function IntegrationsPage() {
  const [connections, setConnections] = useState<Conn[]>([]);
  const [accounts, setAccounts] = useState<Acc[]>([]);
  const [institutions, setInstitutions] = useState<Inst[]>([]);
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("all");
  const [token, setToken] = useState<string | null>(null);
  const [selectedConnector, setSelectedConnector] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [me, setMe] = useState<string | null>(null);

  const createToken = useServerFn(createPluggyConnectToken);
  const saveItem = useServerFn(savePluggyItem);
  const syncConn = useServerFn(syncPluggyConnection);
  const deleteConn = useServerFn(deletePluggyConnection);
  const syncInst = useServerFn(syncInstitutions);

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    setMe(u.user?.id ?? null);

    const [{ data: conns }, { data: accts }, { data: insts }] = await Promise.all([
      supabase
        .from("bank_connections")
        .select("id, institution_name, institution_logo, status, last_synced_at")
        .eq("provider", "pluggy")
        .order("created_at", { ascending: false }),
      supabase.from("bank_accounts").select("id, name, type, balance, hidden, user_id").order("created_at"),
      (supabase as any)
        .from("financial_institutions")
        .select("id, pluggy_institution_id, name, image_url, primary_color, type")
        .eq("provider", "pluggy")
        .eq("status", "active")
        .order("name"),
    ]);
    setConnections((conns ?? []) as any);
    setAccounts((accts ?? []) as any);
    setInstitutions((insts ?? []) as any);

    // Auto-seed catalog on first run
    if (!insts || insts.length === 0) {
      try {
        await syncInst({ data: undefined } as any);
        const { data: again } = await (supabase as any)
          .from("financial_institutions")
          .select("id, pluggy_institution_id, name, image_url, primary_color, type")
          .eq("provider", "pluggy")
          .eq("status", "active")
          .order("name");
        setInstitutions((again ?? []) as any);
      } catch (e) {
        console.error("syncInstitutions failed", e);
      }
    }
  }

  async function toggleHidden(id: string, hidden: boolean) {
    await supabase.from("bank_accounts").update({ hidden: !hidden }).eq("id", id);
    await load();
  }

  const visibleAccounts = accounts
    .filter((a) => !a.hidden)
    .filter((a) => (scope === "mine" ? a.user_id === me : true));
  const totals = {
    balance: visibleAccounts.reduce((s, a) => s + Number(a.balance || 0), 0),
    accounts: visibleAccounts.filter((a) => a.type !== "CREDIT").length,
    cards: visibleAccounts.filter((a) => a.type === "CREDIT").length,
  };

  const filteredInst = useMemo(() => {
    return institutions.filter((i) => {
      if (cat !== "all" && i.type !== cat) return false;
      if (query && !i.name.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [institutions, cat, query]);

  useEffect(() => {
    load();
  }, []);

  async function openConnect(inst?: Inst) {
    try {
      setLoading(true);
      const { accessToken } = await createToken({ data: {} } as any);
      setToken(accessToken);
      setSelectedConnector(inst?.pluggy_institution_id ? Number(inst.pluggy_institution_id) : null);
      setOpen(true);
      setPicking(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao iniciar conexão");
    } finally {
      setLoading(false);
    }
  }

  async function onSuccess(itemData: { item: { id: string } }) {
    setOpen(false);
    toast.loading("Sincronizando contas...", { id: "sync" });
    try {
      const res: any = await saveItem({ data: { itemId: itemData.item.id } });
      toast.success(`Conectado! ${res?.imported ?? 0} transações importadas.`, { id: "sync" });
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar", { id: "sync" });
    }
  }

  async function handleSync(id: string) {
    toast.loading("Atualizando...", { id: `sync-${id}` });
    try {
      await syncConn({ data: { connectionId: id } });
      toast.success("Atualizado", { id: `sync-${id}` });
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao sincronizar", { id: `sync-${id}` });
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remover esta conexão? As transações já importadas serão mantidas.")) return;
    await deleteConn({ data: { connectionId: id } });
    toast.success("Conexão removida");
    await load();
  }

  if (picking) {
    return (
      <>
        <AppHeader title="Conectar banco" subtitle="Escolha sua instituição" />
        <div className="px-4 py-4 space-y-3">
          <Button variant="ghost" size="sm" onClick={() => setPicking(false)} className="gap-1 -ml-2">
            <ArrowLeft className="size-4" /> Voltar
          </Button>
          <div className="relative">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar banco..."
              className="pl-9 rounded-2xl h-11"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => setCat(c.key)}
                className={`shrink-0 text-xs px-3 py-1.5 rounded-full font-medium border transition ${
                  cat === c.key ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          {filteredInst.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              Nenhuma instituição encontrada.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {filteredInst.map((i) => (
                <button
                  key={i.id}
                  onClick={() => openConnect(i)}
                  className="flex flex-col items-center gap-2 p-3 rounded-2xl border border-border hover:bg-accent transition"
                  style={i.primary_color ? { borderColor: `${i.primary_color}33` } : {}}
                >
                  {i.image_url ? (
                    <img src={i.image_url} alt={i.name} className="size-12 rounded-xl object-contain bg-white p-1" />
                  ) : (
                    <div className="size-12 rounded-xl bg-accent flex items-center justify-center">
                      <Landmark className="size-5" />
                    </div>
                  )}
                  <div className="text-xs font-medium text-center line-clamp-2">{i.name}</div>
                </button>
              ))}
            </div>
          )}
        </div>
        {open && token && typeof window !== "undefined" && (
          <Suspense fallback={<div className="p-4 text-center">Carregando conector...</div>}>
            <PluggyConnect
              connectToken={token}
              includeSandbox={false}
              connectorIds={selectedConnector ? [selectedConnector] : undefined}
              onSuccess={onSuccess}
              onError={(err: any) => {
                console.error("Pluggy error", err);
                toast.error("Erro na conexão");
                setOpen(false);
              }}
              onClose={() => setOpen(false)}
            />
          </Suspense>
        )}
      </>
    );
  }

  return (
    <>
      <AppHeader title="Open Finance" subtitle="Conecte seus bancos" />
      <div className="px-4 py-4 space-y-4">
        <Card className="rounded-3xl p-4 bg-gradient-to-br from-primary/10 to-accent-purple/10 border-primary/20">
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs text-muted-foreground">Saldo consolidado</div>
            <div className="flex bg-background/60 rounded-full p-0.5">
              <button onClick={() => setScope("all")} className={`text-[10px] px-2.5 py-1 rounded-full font-medium ${scope === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Casal</button>
              <button onClick={() => setScope("mine")} className={`text-[10px] px-2.5 py-1 rounded-full font-medium ${scope === "mine" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Eu</button>
            </div>
          </div>
          <div className="text-3xl font-bold mt-1">
            {totals.balance.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {totals.accounts} conta(s) · {totals.cards} cartão(ões)
          </div>
        </Card>

        {accounts.length > 0 && (
          <Card className="rounded-3xl shadow-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border font-semibold text-sm">Contas</div>
            <div className="divide-y divide-border">
              {accounts.map((a) => (
                <div key={a.id} className={`px-4 py-3 flex items-center gap-3 ${a.hidden ? "opacity-50" : ""}`}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{a.name || "Conta"}</div>
                    <div className="text-[11px] text-muted-foreground">{a.type === "CREDIT" ? "Cartão" : "Conta corrente"}</div>
                  </div>
                  <div className="text-sm font-semibold">{Number(a.balance).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
                  <button onClick={() => toggleHidden(a.id, a.hidden)} className="size-8 rounded-lg hover:bg-accent flex items-center justify-center" title={a.hidden ? "Mostrar" : "Ocultar"}>
                    {a.hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Button onClick={() => setPicking(true)} disabled={loading} className="w-full rounded-2xl h-12 gap-2">
          <Plus className="size-4" /> Conectar banco
        </Button>

        <Card className="rounded-2xl p-3 bg-success/5 border border-success/20 flex items-start gap-2">
          <ShieldCheck className="size-4 text-success shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground">
            Suas credenciais ficam <b>somente na Pluggy</b> (provedor Open Finance autorizado pelo BACEN).
            O CASAL nunca armazena senhas bancárias.
          </div>
        </Card>

        {connections.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            Nenhum banco conectado. Toque em "Conectar banco" para começar.
          </div>
        ) : (
          <div className="space-y-2">
            {connections.map((c) => (
              <Card key={c.id} className="rounded-3xl p-4 shadow-card flex items-center gap-3">
                {c.institution_logo ? (
                  <img src={c.institution_logo} alt="" className="size-10 rounded-xl object-contain bg-white p-1" />
                ) : (
                  <div className="size-10 rounded-xl bg-accent flex items-center justify-center">
                    <Landmark className="size-5" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{c.institution_name}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="outline" className="text-[10px]">{c.status}</Badge>
                    {c.last_synced_at && (
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(c.last_synced_at).toLocaleString("pt-BR")}
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => handleSync(c.id)} className="size-9 rounded-xl hover:bg-accent flex items-center justify-center">
                  <RefreshCw className="size-4" />
                </button>
                <button onClick={() => handleDelete(c.id)} className="size-9 rounded-xl hover:bg-destructive/10 text-destructive flex items-center justify-center">
                  <Trash2 className="size-4" />
                </button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
