import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { ArrowLeft, Bell } from "lucide-react";

export const Route = createFileRoute("/app/mais/notificacoes")({
  component: NotifPage,
});

function NotifPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: list = [] } = useQuery({
    queryKey: ["notif", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("notifications").select("*").eq("user_id", user!.id).order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (!user) return;
    supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false).then(() => {
      qc.invalidateQueries({ queryKey: ["notif"] });
      qc.invalidateQueries({ queryKey: ["notif-unread"] });
    });
  }, [user, qc]);

  async function open(n: any) {
    if (!n.read) {
      await supabase.from("notifications").update({ read: true }).eq("id", n.id);
      qc.invalidateQueries({ queryKey: ["notif-unread"] });
    }
    if (n.link) navigate({ to: n.link as any });
  }

  return (
    <>
      <header className="sticky top-0 z-30 bg-background/85 backdrop-blur border-b border-border">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/app/mais" className="size-9 rounded-full hover:bg-accent flex items-center justify-center"><ArrowLeft className="size-5" /></Link>
          <h1 className="font-bold">Notificações</h1>
        </div>
      </header>
      <div className="px-4 py-4">
        {list.length === 0 ? (
          <Card className="rounded-2xl p-4 shadow-card">
            <EmptyState icon={Bell} title="Sem notificações" description="Você receberá avisos sobre menções, agenda, metas e tarefas." />
          </Card>
        ) : (
          <Card className="rounded-3xl divide-y divide-border shadow-card overflow-hidden">
            {(list as any[]).map((n) => (
              <button
                key={n.id}
                onClick={() => open(n)}
                className={`w-full text-left px-4 py-3 hover:bg-accent/40 transition ${!n.read ? "bg-accent/20" : ""}`}
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
            ))}
          </Card>
        )}
      </div>
    </>
  );
}
