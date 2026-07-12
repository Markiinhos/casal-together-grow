# Reestruturação do Módulo Financeiro — CASAL

Escopo grande. Vou entregar em **3 fases sequenciais** para garantir qualidade, cada uma testável de forma independente. Antes de começar, preciso confirmar o escopo e algumas decisões.

## Estado atual (o que já existe)

- Tabelas: `transactions`, `credit_cards`, `bank_accounts`, `bank_transactions`, `installments`, `synced_cards`, `bank_connections`, `categories`, `future_bills`, `expense_simulations`, `notifications`, `goals`, `household_needs`.
- Rotas: `/app/financas/` (resumo + lista), `/app/financas/projecao`, `/app/financas/simular`, `/app/financas/simulacoes`, `/app/cartoes`, `/app/contas`, `/app/categorias`.
- Sistema de notificações real-time já operante (triggers para tarefas, eventos, transações, simulações, casa).
- Toggle Meu/Nosso via `useSpace()` e `applySpaceFilter()`.

## Fase 1 — Central Financeira reestruturada (tela `/app/financas`)

**Entregáveis:**
- Nova tela `/app/financas` como central única com:
  - Cabeçalho: voltar, título, seletor de mês (setas prev/next), toggle Meu/Nosso, ícone olho para ocultar valores, gear para configurações.
  - Card principal: **Saldo em contas** (soma de `bank_accounts.current_balance` ativas) + Receitas / Despesas do mês (skeleton durante loading).
  - Seção **Contas**: lista de `bank_accounts` (manual + Pluggy), nome, instituição, saldo, tipo, última atualização, total, botão "Adicionar conta" → abre `/app/contas` (já existe).
  - Seção **Cartões de crédito** com abas **Faturas abertas / fechadas** — reutiliza `credit_cards`, mostra bandeira, final, valor da fatura (via `installments` + `transactions` com `payment_method='credit'`), limite, % usado, fechamento, vencimento, parceladas.
  - Seção **Despesas por categoria** — lista com total, clique → drawer/modal com detalhamento (data, valor, forma pgto, quem, conta/cartão).
  - Seção **Projeção** (link para tela existente).
- **Correção de contagem dupla**: normalizar cálculo de despesas do mês para NÃO contar pagamento de fatura como despesa nova; parcelas contam mês a mês via `installments`; transferências (novo `type='transfer'` ou marcador) excluídas.
- Botão "Financeiro" garantido na home (`/app/index.tsx`) e no menu Mais.

**Arquivos:** reescreve `src/routes/app/financas.index.tsx`; cria `src/components/finance/AccountsSection.tsx`, `CardsSection.tsx`, `CategoriesBreakdown.tsx`, `MonthSelector.tsx`, `HideValuesToggle.tsx`; ajusta home.

## Fase 2 — Planejamento Mensal (orçamento base zero)

**Banco (migração):**
- `monthly_financial_plans` (id, user_id, couple_id, visibility, reference_month DATE, expected_income, suggested_percentage, spending_limit, planned_reserve, planned_goals, distribute_all BOOL, status, created_by, timestamps). Índice único parcial por `(reference_month, user_id, visibility)` quando privado e `(reference_month, couple_id, visibility)` quando compartilhado.
- `monthly_budget_allocations` (id, plan_id, category_id, subcategory_id, planned_amount, timestamps). Unique `(plan_id, category_id, coalesce(subcategory_id, ...))`.
- `monthly_plan_history` (id, plan_id, changed_by, action, old_values jsonb, new_values jsonb, created_at).
- RLS: owner vê privados; membros do casal veem compartilhados (via `is_couple_member`); INSERT valida `couple_id` do próprio usuário; UPDATE/DELETE conforme visibility + role.
- Trigger `notify_partner_on_plan` (criação, edição, faixas 70/90/100/excedido) com dedupe_key.
- Trigger `log_plan_history` para auditoria.

**Rotas:**
- `/app/financas/planejamento` — lista de planos + botão "Novo", "Copiar mês anterior".
- `/app/financas/planejamento/novo` — wizard 4 etapas:
  1. Receita prevista (autopopula receitas recorrentes; opções Meu/Nosso/Somar).
  2. Limite de gastos (sugestão 80%, editável, alerta se > receita).
  3. Seleção de categorias/subcategorias (multi, com busca; inclui Sonhos e metas, Reserva, Compras para Casa).
  4. Distribuição de valores (total, distribuído, disponível; validação; toggle "Distribuir todo o valor").
- `/app/financas/planejamento/$id` — dashboard: cards (receita, limite, gasto, restante, reserva, **disponível por dia**, % utilizado) + lista de categorias com barra, situação (dentro/atenção/próximo/excedido) e alerta.
- `/app/financas/planejamento/$id/editar` — mesma UI do wizard já preenchida.

**Cálculos (todos com guards):**
- `saldo em contas = Σ bank_accounts.current_balance WHERE active`
- `receitas do mês = Σ transactions.amount WHERE type='income' AND date IN mês AND scope`
- `despesas do mês = Σ transactions.amount WHERE type='expense' e não é pagamento de fatura e não é transferência` (+ parcelas do mês via `installments.due_date`)
- `limite sugerido = receita × 0.80`
- `valor restante = spending_limit - despesas contabilizadas`
- `dias restantes = max(0, último_dia_mês - hoje + 1)`; se mês passado, não calcular.
- `disponível por dia = max(0, valor restante / dias restantes)`
- `% categoria = orçamento > 0 ? (gasto / orçamento × 100) : null` (mostra "sem orçamento" quando null). Barra clamp 0–100, texto real. Sem NaN/Infinity/negativos.

## Fase 3 — Ajustes finos + polish

- Página `/app/financas/categorias` (já existe): garantir CRUD com ícone, cor, tipo, arquivamento (não deletar se tem transações), subcategorias.
- Projeção 6–12 meses (já existe `financas.projecao.tsx`): revisar cálculos, incluir parcelas e faturas + planejamento quando existir.
- Testes manuais completos conforme lista do briefing.
- Relatório final com arquivos/rotas/tabelas/policies/fórmulas/testes.

## Decisões que preciso confirmar antes de começar

1. **Fase única ou faseada?** Este é um pedido enorme (3 migrações + ~15 novos componentes + reescrita de 4 rotas + wizard). Recomendo entregar por fases, uma por mensagem, para você validar cada uma. Alternativa: tudo em uma entrega gigante (maior risco de bugs, difícil de revisar).
2. **Categorias — recriar seed?** Você listou 20 categorias. Devo inserir automaticamente as que faltarem para todos os usuários (via migração + trigger em novos users), ou apenas garantir que o usuário possa criá-las manualmente?
3. **Transferências entre contas** — hoje não existe `type='transfer'` no schema `transactions`. Devo adicionar? (Recomendo sim, para não contar como despesa/receita.)
4. **Pagamento de fatura** — como marcar? Sugiro adicionar coluna `is_card_payment BOOLEAN` em `transactions` OU uma categoria/tag reservada. Qual prefere?
