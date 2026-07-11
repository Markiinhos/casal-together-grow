import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Cell, PieChart, Pie } from "recharts";
import { fmtBRL } from "@/lib/household";

export function HouseholdDashboard() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<"current" | "previous" | "next" | "6m" | "12m">("6m");
  
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["household_needs", user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("household_needs").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const filteredItems = useMemo(() => {
    return items.filter((i: any) => {
      if (period === "current") {
        const d = i.planned_date ? new Date(i.planned_date) : i.planned_month ? new Date(i.planned_month) : null;
        return d && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      }
      if (period === "previous") {
        const d = i.planned_date ? new Date(i.planned_date) : i.planned_month ? new Date(i.planned_month) : null;
        let prevM = currentMonth - 1; let prevY = currentYear;
        if(prevM < 0) { prevM = 11; prevY--; }
        return d && d.getMonth() === prevM && d.getFullYear() === prevY;
      }
      if (period === "next") {
        const d = i.planned_date ? new Date(i.planned_date) : i.planned_month ? new Date(i.planned_month) : null;
        let nexM = currentMonth + 1; let nexY = currentYear;
        if(nexM > 11) { nexM = 0; nexY++; }
        return d && d.getMonth() === nexM && d.getFullYear() === nexY;
      }
      if (period === "6m") {
        const d = i.planned_date ? new Date(i.planned_date) : i.planned_month ? new Date(i.planned_month) : null;
        if (!d) return false;
        const diffMonths = (currentYear - d.getFullYear()) * 12 + (currentMonth - d.getMonth());
        return diffMonths >= -6 && diffMonths <= 6; // slightly broader for future
      }
      if (period === "12m") {
        const d = i.planned_date ? new Date(i.planned_date) : i.planned_month ? new Date(i.planned_month) : null;
        if (!d) return false;
        const diffMonths = (currentYear - d.getFullYear()) * 12 + (currentMonth - d.getMonth());
        return diffMonths >= -12 && diffMonths <= 12;
      }
      return true;
    });
  }, [items, period, currentMonth, currentYear]);

  // Summaries
  const validForTotal = filteredItems.filter((i: any) => i.status !== "cancelled");
  const totalPlanned = validForTotal.reduce((acc: number, i: any) => acc + Number(i.estimated_amount || 0), 0);
  const totalActual = validForTotal.filter((i: any) => ["purchased", "done"].includes(i.status)).reduce((acc: number, i: any) => acc + Number(i.actual_amount || i.estimated_amount || 0), 0);
  const diff = totalActual - totalPlanned;
  
  const pendingCount = validForTotal.filter((i: any) => !["purchased", "done"].includes(i.status)).length;
  const urgentCount = validForTotal.filter((i: any) => !["purchased", "done"].includes(i.status) && i.priority === "urgent").length;
  const doneCount = validForTotal.filter((i: any) => ["purchased", "done"].includes(i.status)).length;

  // Chart 1: Planned vs Actual by Month
  const monthlyData = useMemo(() => {
    const data: Record<string, { plan: number, act: number }> = {};
    validForTotal.forEach((i: any) => {
      const d = i.planned_date ? new Date(i.planned_date) : i.planned_month ? new Date(i.planned_month) : null;
      if (!d) return;
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      if (!data[key]) data[key] = { plan: 0, act: 0 };
      data[key].plan += Number(i.estimated_amount || 0);
      if (["purchased", "done"].includes(i.status)) {
        data[key].act += Number(i.actual_amount || 0);
      }
    });
    return Object.entries(data).map(([name, vals]) => ({ name, Planejado: vals.plan, Realizado: vals.act })).sort((a,b) => a.name.localeCompare(b.name));
  }, [validForTotal]);

  // Chart 2: Category
  const categoryData = useMemo(() => {
    const data: Record<string, number> = {};
    validForTotal.forEach((i: any) => {
      if (!i.category) return;
      data[i.category] = (data[i.category] || 0) + Number(i.actual_amount || i.estimated_amount || 0);
    });
    return Object.entries(data).map(([name, value]) => ({ name, value })).filter(d => d.value > 0).sort((a,b) => b.value - a.value);
  }, [validForTotal]);

  // Chart 3: Priorities (Pendencies)
  const priorityData = useMemo(() => {
    const data: Record<string, number> = { low: 0, medium: 0, high: 0, urgent: 0 };
    validForTotal.filter((i: any) => !["purchased", "done"].includes(i.status)).forEach((i: any) => {
      if (data[i.priority] !== undefined) data[i.priority]++;
    });
    return [
      { name: "Baixa", value: data.low },
      { name: "Média", value: data.medium },
      { name: "Alta", value: data.high },
      { name: "Urgente", value: data.urgent },
    ].filter(d => d.value > 0);
  }, [validForTotal]);

  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];
  const PRIO_COLORS = ['#94a3b8', '#8b5cf6', '#f59e0b', '#ef4444'];

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
        {[
          { v: "current", l: "Mês Atual" },
          { v: "previous", l: "Mês Anterior" },
          { v: "next", l: "Próx. Mês" },
          { v: "6m", l: "6 Meses" },
          { v: "12m", l: "12 Meses" },
        ].map(p => (
          <button
            key={p.v}
            onClick={() => setPeriod(p.v as any)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition ${
              period === p.v ? "bg-primary text-white border-primary" : "bg-background border-border text-muted-foreground"
            }`}
          >
            {p.l}
          </button>
        ))}
      </div>

      {!isLoading && items.length === 0 ? (
        <Card className="rounded-2xl p-6 shadow-card text-center text-sm text-muted-foreground">
          Ainda não há dados suficientes para gerar este relatório.
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Card className="p-3 text-center rounded-2xl shadow-card">
              <div className="text-[10px] uppercase text-muted-foreground font-semibold">Planejado</div>
              <div className="text-sm font-bold mt-1 text-primary">{fmtBRL(totalPlanned)}</div>
            </Card>
            <Card className="p-3 text-center rounded-2xl shadow-card">
              <div className="text-[10px] uppercase text-muted-foreground font-semibold">Realizado</div>
              <div className="text-sm font-bold mt-1 text-success">{fmtBRL(totalActual)}</div>
            </Card>
            <Card className="p-3 text-center rounded-2xl shadow-card">
              <div className="text-[10px] uppercase text-muted-foreground font-semibold">Diferença</div>
              <div className={`text-sm font-bold mt-1 ${diff < 0 ? 'text-success' : diff > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                {diff < 0 ? `Economia de ${fmtBRL(Math.abs(diff))}` : diff > 0 ? `${fmtBRL(diff)} acima` : "Exato"}
              </div>
            </Card>
            <Card className="p-3 text-center rounded-2xl shadow-card">
              <div className="text-[10px] uppercase text-muted-foreground font-semibold">Itens</div>
              <div className="text-xs font-medium mt-1">
                <span className="text-destructive">{urgentCount} urgentes</span> / <span>{pendingCount} pendentes</span> / <span className="text-success">{doneCount} concluídos</span>
              </div>
            </Card>
          </div>

          <Card className="p-4 rounded-2xl shadow-card space-y-4">
            <h3 className="font-semibold text-sm">Planejado vs Realizado</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" opacity={0.2} />
                  <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `R$ ${v}`} width={50} />
                  <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Bar dataKey="Planejado" fill="#6366f1" radius={[4,4,0,0]} />
                  <Bar dataKey="Realizado" fill="#10b981" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-4 rounded-2xl shadow-card space-y-4">
              <h3 className="font-semibold text-sm">Gastos por Categoria</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryData} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} stroke="#333" opacity={0.2} />
                    <XAxis type="number" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `R$ ${v}`} />
                    <YAxis dataKey="name" type="category" fontSize={10} tickLine={false} axisLine={false} width={80} />
                    <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} />
                    <Bar dataKey="value" fill="#8b5cf6" radius={[0,4,4,0]}>
                       {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-4 rounded-2xl shadow-card space-y-4">
              <h3 className="font-semibold text-sm">Pendências por Prioridade</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <Pie data={priorityData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} fill="#8884d8" paddingAngle={2} label>
                      {priorityData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={
                          entry.name === "Baixa" ? PRIO_COLORS[0] : 
                          entry.name === "Média" ? PRIO_COLORS[1] : 
                          entry.name === "Alta" ? PRIO_COLORS[2] : PRIO_COLORS[3]
                        } />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} />
                    <Legend wrapperStyle={{ fontSize: '10px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
