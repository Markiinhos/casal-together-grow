import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Landmark, Plus, RefreshCw, Trash2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PluggyConnect } from "react-pluggy-connect";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  createPluggyConnectToken,
  savePluggyItem,
  syncPluggyConnection,
  deletePluggyConnection,
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

function IntegrationsPage() {
  const [connections, setConnections] = useState<Conn[]>([]);
  const [accounts, setAccounts] = useState<Acc[]>([]);
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [token, setToken] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [me, setMe] = useState<string | null>(null);

  const createToken = useServerFn(createPluggyConnectToken);
  const saveItem = useServerFn(savePluggyItem);
  const syncConn = useServerFn(syncPluggyConnection);
  const deleteConn = useServerFn(deletePluggyConnection);

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    setMe(u.user?.id ?? null);

    const { data: conns } = await supabase
      .from("bank_connections")
      .select("id, institution_name, institution_logo, status, last_synced_at")
      .eq("provider", "pluggy")
      .order("created_at", { ascending: false });
    setConnections((conns ?? []) as any);

    const { data: accts } = await supabase
      .from("bank_accounts")
      .select("id, name, type, balance, hidden, user_id")
      .order("created_at");
    setAccounts((accts ?? []) as any);
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

  useEffect(() => {
    load();
  }, []);

  async function handleConnect() {
    try {
      setLoading(true);
      const { accessToken } = await createToken({ data: {} });
      setToken(accessToken);
      setOpen(true);
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

  return (
    <>
      <AppHeader title="Open Finance" subtitle="Conecte seus bancos" />
      <div className="px-4 py-4 space-y-4">
        <Card className="rounded-3xl p-4 bg-gradient-to-br from-primary/10 to-accent-purple/10 border-primary/20">
          <div className="text-xs text-muted-foreground">Saldo consolidado</div>
          <div className="text-3xl font-bold mt-1">
            {totals.balance.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {totals.accounts} conta(s) · {totals.cards} cartão(ões)
          </div>
        </Card>

        <Button onClick={handleConnect} disabled={loading} className="w-full rounded-2xl h-12 gap-2">
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

        {open && token && (
          <PluggyConnect
            connectToken={token}
            includeSandbox={false}
            onSuccess={onSuccess}
            onError={(err) => {
              console.error("Pluggy error", err);
              toast.error("Erro na conexão");
              setOpen(false);
            }}
            onClose={() => setOpen(false)}
          />
        )}
      </div>
    </>
  );
}
