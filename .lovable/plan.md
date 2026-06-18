# CASAL V3 — Expansão Completa

Pedido enorme. Vou entregar em **5 fases incrementais** para você validar progresso e evitar uma única entrega gigante difícil de revisar. Cada fase fica funcional ao final, com tabelas, RLS, realtime e telas.

A identidade visual atual (tokens em `src/styles.css`, AppShell, AppHeader) será mantida em todas as telas.

---

## Estado atual (o que já existe e será reaproveitado)

- Finanças básicas, cartões/parcelamentos, Open Finance (Pluggy), insights
- Tarefas da casa (`house_tasks`, categorias, histórico)
- Saúde básica (`health_metrics`, `health_meals`, `water_intake`, `workouts`)
- Cardápio básico (`meal_plans`, `shopping_items`)
- Metas (`goals`), Dates, Memórias, Notificações
- Gamificação parcial: `user_points`, `achievements`, `challenges`, `challenge_progress`, função `award_points`

Vou **estender** essas tabelas em vez de duplicá-las.

---

## Fase 1 — Módulo Rotina (novo)

**Tabelas novas:**
- `habits` (nome, ícone, frequência, período manhã/tarde/noite, target_per_week, scope individual/casal)
- `habit_logs` (habit_id, date, completed_by)
- `routines` (título, período do dia, ordem, dias da semana, scope)
- `routine_items` (routine_id, label, ordem)
- `routine_completions` (routine_id, date, user_id)
- `weekly_goals` / `monthly_goals` (título, status, week_start/month)

Tudo com RLS via `is_couple_member`, GRANTs, realtime.

**Telas:**
- `/app/rotina` — abas: Hoje | Semana | Mês | Hábitos | Metas
- Dashboard de hábitos: sequência (streak), produtividade, pendências
- Rotinas manhã/tarde/noite com checklist
- Calendário/agenda reaproveita `events`

## Fase 2 — Cardápio Completo

**Tabelas novas:**
- `recipes` (nome, ingredientes jsonb, modo de preparo, favorito, tags, tempo)
- `meal_plan_items` estende `meal_plans` com slot (café/almoço/jantar/lanche), recipe_id, porções
- Geração automática de itens em `shopping_items` a partir dos ingredientes da semana

**Telas:**
- `/app/cardapio` reformulado: planner semanal/mensal estilo grade, biblioteca de receitas, favoritos, sugestões, botão "Gerar lista de compras"

## Fase 3 — Saúde + Check-in Academia

**Tabelas novas:**
- `body_measurements` (peso, altura, IMC calculado, cintura, quadril, braço, perna)
- `sleep_logs` (data, horas, qualidade)
- `mood_logs` (data, humor 1-5, nota)
- `medications` (nome, dose, horários, ativa)
- `medication_logs`
- `appointments` (consultas, exames — data, tipo, médico, status, anexo)
- `gym_checkins` (data, treino, duração, calorias, observações)
- View/aggregates para streak

**Telas:**
- `/app/saude` reformulado: gráficos (recharts) peso, água, exercícios
- `/app/saude/academia` (check-in, streak, recordes, ranking do casal, medalhas)
- IMC automático

## Fase 4 — Casa + Financeiro Premium

**Casa — extender:**
- `house_tasks` ganha `room` (cozinha/banheiro/quarto/sala/lavanderia/escritório), `frequency`
- `home_inventory` (item, ambiente, quantidade, mínimo, validade)
- `home_repairs` (item, prioridade, status, custo estimado)
- `/app/casa` reformulado com abas por ambiente, escala, estoque, reparos

**Financeiro Premium:**
- `budgets` (mês, category_id, valor planejado)
- `subscriptions` (nome, valor, dia cobrança, ativa)
- `recurring_bills` (já temos `future_bills` — estender)
- `emergency_fund`, `investments` (instituição, tipo, valor, rentabilidade)
- `/app/contas` e novo `/app/financeiro/planejamento`: orçamento por categoria com barras, fluxo de caixa, reserva, investimentos, relatórios anual/mensal
- Indicadores: saldo atual/previsto, economia, por categoria, por parceiro

## Fase 5 — Dashboard, Gamificação Unificada e Polimento

**Dashboard `/app/`** — widgets:
- Rotina de hoje, próximas tarefas, próximo treino, água, cardápio do dia, lista de compras, próxima conta, meta financeira principal, próximo date, última memória

**Gamificação:**
- Triggers de pontos para: treino (gym_checkin), hábito (habit_log), refeição registrada, água, meta semanal/mensal cumprida, economia (transação income > meta)
- Tabela `levels` (nível, pontos mínimos, título) + cálculo de nível atual
- Página `/app/conquistas` com medalhas, nível, ranking do casal, desafios semanais/mensais automáticos

**Realtime:** habilitar publicação em todas as novas tabelas críticas (habits, gym_checkins, routine_completions, budgets, etc).

---

## Detalhes técnicos

- Todas as migrações seguirão: CREATE TABLE → GRANT (authenticated + service_role) → ENABLE RLS → POLICY usando `is_couple_member(couple_id)` ou `auth.uid() = user_id`
- Triggers `update_updated_at_column` em todas
- Realtime via `ALTER PUBLICATION supabase_realtime ADD TABLE ...`
- Storage `attachments` (já existe) para exames/receitas
- Tudo client-side via `@/integrations/supabase/client` com TanStack Query
- Gráficos: `recharts` (já no projeto)

---

## Confirmação

Quer que eu siga **fase por fase com aprovação entre cada uma** (mais seguro, você revisa cada bloco) ou **emendar tudo seguido sem parar** (mais rápido, mas commits enormes)?

Posso começar a **Fase 1 (Rotina)** assim que você confirmar.
