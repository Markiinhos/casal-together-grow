import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { ArrowLeft, Bell, CheckCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/mais/notificacoes")({
  component: NotifPage,
});

function NotifPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: list = [], refetch } = useQuery({
    queryKey: ["notif", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`notif-list-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, refetch]);

  async function open(n: any) {
    if (!n.read) {
      await supabase.from("notifications").update({ read: true }).eq("id", n.id);
      qc.invalidateQueries({ queryKey: ["notif-unread"] });
      qc.invalidateQueries({ queryKey: ["notif"] });
    }
    if (n.link) navigate({ to: n.link as any });
  }

  async function markAll() {
    if (!user) return;
    await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
    qc.invalidateQueries({ queryKey: ["notif-unread"] });
    qc.invalidateQueries({ queryKey: ["notif"] });
    toast.success("Todas marcadas como lidas");
  }

  async function remove(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await supabase.from("notifications").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["notif"] });
    qc.invalidateQueries({ queryKey: ["notif-unread"] });
  }

  const unread = (list as any[]).filter((n) => !n.read).length;

  return (
    <>
      <header className="sticky top-0 z-30 bg-background/85 backdrop-blur border-b border-border">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/app/mais" className="size-9 rounded-full hover:bg-accent flex items-center justify-center"><ArrowLeft className="size-5" /></Link>
          <h1 className="font-bold flex-1">Notificações</h1>
          {unread > 0 && (
            <Button size="sm" variant="ghost" onClick={markAll} className="text-xs gap-1">
              <CheckCheck className="size-3.5" /> Marcar todas
            </Button>
          )}
        </div>
      </header>
      <div className="px-4 py-4">
        {list.length === 0 ? (
          <Card className="rounded-2xl p-4 shadow-card">
            <EmptyState icon={Bell} title="Sem notificações" description="Você receberá avisos sobre menções, agenda, metas, tarefas e finanças." />
          </Card>
        ) : (
          <Card className="rounded-3xl divide-y divide-border shadow-card overflow-hidden">
            {(list as any[]).map((n) => (
              <div key={n.id} className={`flex items-stretch ${!n.read ? "bg-accent/20" : ""}`}>
                <button
                  onClick={() => open(n)}
                  className="flex-1 text-left px-4 py-3 hover:bg-accent/40 transition"
                >
                  <div className="flex items-start gap-2">
                    {!n.read && <span className="mt-1.5 size-2 rounded-full bg-primary shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{n.title}</div>
                      {n.body && <div className="text-xs text-muted-foreground line-clamp-2">{n.body}</div>}
                      <div className="text-[10px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString("pt-BR")}</div>
                    </div>
                  </div>
                </button>
                <button onClick={(e) => remove(n.id, e)} className="px-3 text-muted-foreground hover:text-destructive" aria-label="Excluir">
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </Card>
        )}
      </div>
    </>
  );
}
