import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM = `Você interpreta mensagens curtas em PT-BR de um app de casal e extrai uma ação.
Tipos válidos: expense (despesa), income (receita), task (tarefa doméstica), event (compromisso).
Finanças em BRL: aceite "R$50", "50 reais", "cinquenta", "1500", "1.500,00", etc.
Datas relativas ("hoje","amanhã","sexta","próxima semana") → YYYY-MM-DD com base na data atual.
Sempre sugira uma categoria curta em PT-BR (ex.: Mercado, Transporte, Lazer, Casa, Salário, Freelance, Saúde, Educação).
Retorne SOMENTE via a tool register_action.`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text, autoCommit = true } = await req.json();
    if (!text || typeof text !== "string") return json({ error: "text required" }, 400);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    if (!LOVABLE_API_KEY) return json({ error: "AI key not configured" }, 500);

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const { data: profile } = await supabase.from("profiles").select("couple_id").eq("id", user.id).maybeSingle();
    const coupleId = profile?.couple_id ?? null;

    const today = new Date().toISOString().slice(0, 10);

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: `${SYSTEM}\nData atual: ${today}` },
          { role: "user", content: text },
        ],
        tools: [{
          type: "function",
          function: {
            name: "register_action",
            description: "Registra a ação interpretada do texto",
            parameters: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["expense", "income", "task", "event"] },
                title: { type: "string", description: "Título curto em PT-BR" },
                amount: { type: "number", description: "Valor em reais (apenas expense/income)" },
                category_hint: { type: "string", description: "Categoria sugerida (Mercado, Transporte, Salário...)" },
                date: { type: "string", description: "YYYY-MM-DD (event/task/finance)" },
                time: { type: "string", description: "HH:MM (event)" },
                priority: { type: "string", enum: ["low", "medium", "high"] },
                description: { type: "string" },
              },
              required: ["type", "title"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "register_action" } },
      }),
    });

    if (aiRes.status === 429) return json({ error: "rate_limited" }, 429);
    if (aiRes.status === 402) return json({ error: "payment_required" }, 402);
    if (!aiRes.ok) {
      console.error("AI error:", aiRes.status, await aiRes.text());
      return json({ error: "ai_error" }, 500);
    }

    const data = await aiRes.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) return json({ error: "no_parse" }, 200);

    const parsed = JSON.parse(toolCall.function.arguments) as {
      type: "expense" | "income" | "task" | "event";
      title: string;
      amount?: number;
      category_hint?: string;
      date?: string;
      time?: string;
      priority?: "low" | "medium" | "high";
      description?: string;
    };

    if (!autoCommit) return json({ parsed, created: null });
    if (!coupleId) return json({ parsed, created: null, warning: "no_couple" });

    // --- Finance branch ---
    if (parsed.type === "expense" || parsed.type === "income") {
      const txType = parsed.type === "expense" ? "expense" : "income";
      let categoryId: string | null = null;
      if (parsed.category_hint) {
        const hint = parsed.category_hint.trim();
        const { data: existing } = await supabase
          .from("categories")
          .select("id")
          .eq("couple_id", coupleId)
          .eq("type", txType)
          .ilike("name", hint)
          .maybeSingle();
        if (existing?.id) {
          categoryId = existing.id;
        } else {
          const { data: created } = await supabase
            .from("categories")
            .insert({ couple_id: coupleId, user_id: user.id, name: hint, type: txType, color: "#FF6B57", icon: "tag" })
            .select("id").single();
          categoryId = created?.id ?? null;
        }
      }

      const { data: tx, error } = await supabase.from("transactions").insert({
        couple_id: coupleId,
        user_id: user.id,
        type: txType,
        amount: parsed.amount ?? 0,
        category_id: categoryId,
        description: parsed.title,
        date: parsed.date ?? today,
        source: "ai",
        note: parsed.description ?? null,
      }).select().single();

      if (error) { console.error(error); return json({ error: "insert_failed", detail: error.message }, 500); }
      return json({ parsed, created: { table: "transactions", row: tx } });
    }

    // --- Task branch ---
    if (parsed.type === "task") {
      const { data: task, error } = await supabase.from("house_tasks").insert({
        couple_id: coupleId,
        user_id: user.id,
        name: parsed.title,
        description: parsed.description ?? null,
        priority: parsed.priority ?? "medium",
        due_date: parsed.date ?? null,
      }).select().single();
      if (error) { console.error(error); return json({ error: "insert_failed", detail: error.message }, 500); }
      return json({ parsed, created: { table: "house_tasks", row: task } });
    }

    // --- Event branch ---
    if (parsed.type === "event") {
      const { data: ev, error } = await supabase.from("events").insert({
        couple_id: coupleId,
        user_id: user.id,
        title: parsed.title,
        description: parsed.description ?? null,
        event_date: parsed.date ?? today,
        event_time: parsed.time ?? null,
      }).select().single();
      if (error) { console.error(error); return json({ error: "insert_failed", detail: error.message }, 500); }
      return json({ parsed, created: { table: "events", row: ev } });
    }

    return json({ parsed, created: null });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
