import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile, useCouple, usePartner } from "@/lib/hooks";
import { formatBRL } from "@/lib/couple";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { CoupleAvatar } from "@/components/CouplePhotoUploader";
import { TrendingUp, TrendingDown, Target, CheckSquare, CalendarDays, Heart, UserPlus } from "lucide-react";

export const Route = createFileRoute("/app/")({
  component: HomePage,
});

function HomePage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { data: couple } = useCouple();
  const { data: partner } = usePartner();
  const coupleId = profile?.couple_id ?? null;

  // Current month finance summary
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const { data: txSummary } = useQuery({
    queryKey: ["home-tx", coupleId, user?.id, monthStart],
    queryFn: async () => {
      const q = supabase.from("transactions").select("type,amount").gte("date", monthStart);
      const { data } = coupleId
        ? await q.eq("couple_id", coupleId)
        : await q.eq("user_id", user!.id);
      let income = 0, expense = 0;
      (data ?? []).forEach((t: any) => {
        if (t.type === "income") income += Number(t.amount);
        if (t.type === "expense") expense += Number(t.amount);
      });
      return { income, expense, balance: income - expense };
    },
    enabled: !!user,
  });

  const { data: goals } = useQuery({
    queryKey: ["home-goals", coupleId, user?.id],
    queryFn: async () => {
      const q = supabase.from("goals").select("*").eq("status", "active").order("created_at", { ascending: false }).limit(3);
      const { data } = coupleId ? await q.eq("couple_id", coupleId) : await q.eq("user_id", user!.id);
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: upcomingEvents } = useQuery({
    queryKey: ["home-events", coupleId, user?.id],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const q = supabase.from("events").select("*").gte("event_date", today).order("event_date").limit(3);
      const { data } = coupleId ? await q.eq("couple_id", coupleId) : await q.eq("user_id", user!.id);
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: pendingTasks } = useQuery({
    queryKey: ["home-tasks", coupleId, user?.id],
    queryFn: async () => {
      const q = supabase.from("house_tasks").select("*").eq("completed", false).order("due_date", { nullsFirst: false }).limit(5);
      const { data } = coupleId ? await q.eq("couple_id", coupleId) : await q.eq("user_id", user!.id);
      return data ?? [];
    },
    enabled: !!user,
  });

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
  })();

  const firstName = profile?.full_name?.split(" ")[0] ?? "";

  return (
    <>
      <AppHeader title={couple?.name || "Casal"} subtitle={partner ? `Você + ${partner.full_name?.split(" ")[0] ?? "parceiro"}` : "Convide seu parceiro"} />
      <div className="px-4 py-4 space-y-5">
        <div className="flex items-center gap-3">
          {couple && (
            <CoupleAvatar coupleId={couple.id} photoPath={(couple as any).photo_url ?? null} size={56} />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-muted-foreground">{greeting},</p>
            <h2 className="text-2xl font-bold truncate">{firstName} 💛</h2>
          </div>
        </div>

        {!coupleId && (
          <Card className="rounded-3xl p-5 gradient-coral text-white border-0 shadow-soft">
            <div className="flex items-start gap-3">
              <div className="size-10 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                <UserPlus className="size-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-0.5">Conecte seu parceiro</h3>
                <p className="text-sm text-white/85 mb-3">Compartilhem finanças, agenda e metas em tempo real.</p>
                <Link to="/app/parceiro">
                  <Button size="sm" className="bg-white text-primary hover:bg-white/90 rounded-xl">
                    Convidar
                  </Button>
                </Link>
              </div>
            </div>
          </Card>
        )}

        {/* Finance summary */}
        <Card className="rounded-3xl p-5 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Resumo do mês</h3>
            <Link to="/app/financas" className="text-xs text-primary font-medium">Ver tudo</Link>
          </div>
          <div className="text-3xl font-bold mb-1">{formatBRL(txSummary?.balance ?? 0)}</div>
          <p className="text-xs text-muted-foreground mb-4">Saldo atual</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-success/10 p-3">
              <div className="flex items-center gap-1.5 text-success mb-1">
                <TrendingUp className="size-4" /><span className="text-xs font-medium">Receitas</span>
              </div>
              <div className="font-semibold text-sm">{formatBRL(txSummary?.income ?? 0)}</div>
            </div>
            <div className="rounded-2xl bg-destructive/10 p-3">
              <div className="flex items-center gap-1.5 text-destructive mb-1">
                <TrendingDown className="size-4" /><span className="text-xs font-medium">Despesas</span>
              </div>
              <div className="font-semibold text-sm">{formatBRL(txSummary?.expense ?? 0)}</div>
            </div>
          </div>
        </Card>

        {/* Goals */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Metas ativas</h3>
            <Link to="/app/metas" className="text-xs text-primary font-medium">Ver tudo</Link>
          </div>
          {goals && goals.length > 0 ? (
            <div className="space-y-2">
              {goals.map((g: any) => {
                const pct = g.target_amount > 0 ? Math.min(100, (Number(g.current_amount) / Number(g.target_amount)) * 100) : 0;
                return (
                  <Card key={g.id} className="rounded-2xl p-4 shadow-card">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="size-9 rounded-xl bg-accent flex items-center justify-center">
                        <Target className="size-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{g.name}</div>
                        <div className="text-xs text-muted-foreground">{formatBRL(Number(g.current_amount))} de {formatBRL(Number(g.target_amount))}</div>
                      </div>
                      <div className="text-sm font-semibold text-primary">{Math.round(pct)}%</div>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full gradient-coral transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="rounded-2xl p-4 shadow-card">
              <EmptyState icon={Target} title="Sem metas" description="Crie sua primeira meta a dois" action={
                <Link to="/app/metas"><Button size="sm" className="rounded-xl">Criar meta</Button></Link>
              } />
            </Card>
          )}
        </section>

        {/* Upcoming events */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Próximos compromissos</h3>
            <Link to="/app/agenda" className="text-xs text-primary font-medium">Ver tudo</Link>
          </div>
          {upcomingEvents && upcomingEvents.length > 0 ? (
            <div className="space-y-2">
              {upcomingEvents.map((e: any) => (
                <Card key={e.id} className="rounded-2xl p-3 shadow-card flex items-center gap-3">
                  <div className="size-10 rounded-xl bg-accent-purple/10 flex flex-col items-center justify-center shrink-0">
                    <span className="text-[10px] uppercase font-semibold text-accent-purple">{new Date(e.event_date).toLocaleDateString("pt-BR", { month: "short" }).slice(0, 3)}</span>
                    <span className="text-sm font-bold text-accent-purple leading-none">{new Date(e.event_date).getDate()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{e.title}</div>
                    <div className="text-xs text-muted-foreground">{e.event_time?.slice(0, 5) ?? "Dia todo"}</div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="rounded-2xl p-4 shadow-card">
              <EmptyState icon={CalendarDays} title="Nenhum compromisso" description="Adicione eventos para vocês dois" />
            </Card>
          )}
        </section>

        {/* Tasks */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Tarefas pendentes</h3>
            <Link to="/app/tarefas" className="text-xs text-primary font-medium">Ver tudo</Link>
          </div>
          {pendingTasks && pendingTasks.length > 0 ? (
            <Card className="rounded-2xl divide-y divide-border shadow-card overflow-hidden">
              {pendingTasks.slice(0, 4).map((t: any) => (
                <div key={t.id} className="px-4 py-3 flex items-center gap-3">
                  <CheckSquare className="size-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{t.name}</div>
                    {t.due_date && <div className="text-xs text-muted-foreground">{new Date(t.due_date).toLocaleDateString("pt-BR")}</div>}
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    t.priority === "high" ? "bg-destructive/10 text-destructive" :
                    t.priority === "medium" ? "bg-warning/10 text-warning-foreground" :
                    "bg-muted text-muted-foreground"
                  }`}>{t.priority === "high" ? "Alta" : t.priority === "medium" ? "Média" : "Baixa"}</span>
                </div>
              ))}
            </Card>
          ) : (
            <Card className="rounded-2xl p-4 shadow-card">
              <EmptyState icon={Heart} title="Tudo em dia ✨" description="Sem tarefas pendentes no momento" />
            </Card>
          )}
        </section>
      </div>
    </>
  );
}
