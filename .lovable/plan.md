# Simulador de Despesas

Nova área no módulo financeiro que permite simular uma compra antes de virar despesa real, mostrando impacto no mês, saldo, fatura, próximos meses e nível de risco.

## Fluxo do usuário

1. Em `/app/financas` (e no botão de adicionar despesa `/app/adicionar`), aparece a opção "Simular despesa" ao lado de "Adicionar despesa real".
2. Rota nova: `/app/financas/simular` — formulário completo.
3. Após simular, tela de resultado com cards, gráficos, nível de risco, sugestão e ações: confirmar como despesa real, salvar, editar, comparar formas de pagamento, compartilhar com parceiro.
4. Rota `/app/financas/simulacoes` — histórico com filtros (privadas, compartilhadas, convertidas, arquivadas, alto/baixo risco).

Respeita Meu Espaço / Nosso Espaço via `useSpace()`; o seletor de visibilidade (private/shared) já existente é reutilizado.

## Backend

Nova tabela `expense_simulations` com RLS espelhando o padrão de `transactions`:

- Campos: `title`, `amount`, `payment_method`, `card_id`, `installments`, `interest_enabled`, `interest_rate`, `final_amount`, `first_payment_date`, `purchase_date`, `category`, `simulation_result` (jsonb com projeção mês a mês, antes/depois, risco), `risk_level`, `status` (draft/simulated/converted/archived), `converted_expense_id`, `metadata`, `visibility`, `user_id`, `couple_id`.
- RLS: SELECT/UPDATE/DELETE seguem o padrão privado=dono / compartilhado=membros do casal. INSERT sempre `user_id = auth.uid()`.
- Trigger `notify_partner_on_simulation`: notifica o parceiro quando uma simulação compartilhada é criada, convertida em despesa, ou marcada como alto risco.
- Ao converter em despesa: uma server function cria a `transactions` (e installments quando aplicável, aproveitando o trigger existente `generate_installments`) e grava `converted_expense_id` + `status='converted'`.

## Cálculo de impacto (client-side, puro TS)

Módulo `src/lib/simulator.ts` — recebe: transações do mês atual, faturas, parcelas em aberto, orçamento configurado, e a simulação. Retorna:

- Despesas antes / depois do mês.
- Saldo previsto antes / depois.
- Impacto na fatura do cartão (usa `closing_day`/`due_day` de `credit_cards` para localizar a fatura correta).
- Projeção mês a mês (12 meses) para parcelas / financiamento / boleto.
- Percentual de orçamento antes / depois.
- Nível de risco: seguro / atenção / arriscado / crítico — baseado em delta de saldo, comprometimento de renda, cauda de parcelas.
- Sugestão em linguagem simples derivada dessas métricas.

Regras por forma de pagamento:
- Pix / dinheiro / débito → impacto integral no mês da compra.
- Cartão à vista → soma na fatura correspondente ao fechamento.
- Cartão parcelado → distribui em N meses; se `interest_enabled`, aplica taxa mensal para calcular parcela final.
- Boleto → impacta o mês do vencimento.
- Financiamento → tabela Price (juros compostos) por N meses.

## Comparador de formas de pagamento

Rota `/app/financas/simular/comparar` — usuário informa valor e o app roda o simulador para: Pix à vista, Cartão 6x, Cartão 12x, Boleto 1x. Mostra cards lado a lado com impacto mensal e risco, e destaca "Melhor opção para este momento".

## Gráficos (recharts, já instalado)

- Barras: despesas antes vs depois.
- Linha: saldo previsto ao longo dos próximos 6 meses.
- Barras empilhadas: parcelas futuras mês a mês.
- Radial/progress: percentual de orçamento antes vs depois.
- Linha: evolução da fatura do cartão nos próximos 12 meses.

## Notificações

Integração com `notifications` existente. Trigger dispara quando `visibility='shared'` em INSERT/converted/high risk. Reaproveita o padrão de `notify_partner_on_task`.

## Arquivos a criar

- `supabase/migrations/<ts>_expense_simulations.sql` — tabela + RLS + trigger de notificação.
- `src/lib/simulator.ts` — cálculo puro (unit-testável).
- `src/lib/simulator.functions.ts` — `saveSimulation`, `convertSimulationToExpense`, `listSimulations`, `archiveSimulation` (todas com `requireSupabaseAuth`).
- `src/routes/app/financas/simular.tsx` — formulário + resultado.
- `src/routes/app/financas/simular.comparar.tsx` — comparador.
- `src/routes/app/financas/simulacoes.tsx` — histórico com filtros.
- `src/components/simulator/SimulationResult.tsx` — cards + gráficos.
- `src/components/simulator/RiskBadge.tsx`, `PaymentMethodPicker.tsx`, `InstallmentsPicker.tsx`.

## Arquivos a editar

- `src/routes/app/adicionar.tsx` — adicionar toggle "Adicionar despesa real / Simular despesa".
- `src/routes/app/financas.tsx` — atalho "Simular despesa" e link para histórico.
- `src/components/BottomNav.tsx` — sem mudança (fica dentro de Finanças).

## Ordem de implementação

1. Migração `expense_simulations` + RLS + trigger de notificação.
2. `src/lib/simulator.ts` (cálculo puro).
3. Rota `simular.tsx` com formulário + resultado + gráficos.
4. Server functions (salvar / converter / listar / arquivar).
5. Comparador de formas de pagamento.
6. Histórico com filtros.
7. Atalhos em `adicionar.tsx` e `financas.tsx`.

## Detalhes técnicos

- Cálculos rodam no cliente para feedback instantâneo; ao salvar, o resultado (`simulation_result`) é persistido em JSONB para exibir o mesmo snapshot depois.
- Ao converter em despesa: chamamos `insertTransaction` reutilizando o trigger `generate_installments` existente — nada é duplicado. `simulation.status='converted'` + `converted_expense_id` amarra os dois.
- Todos os fetches de dados financeiros da simulação usam server functions com `requireSupabaseAuth` (não expõe token).
- Grafo de leitura via `useSuspenseQuery` + `ensureQueryData` no loader (padrão TanStack).
- Rotas ficam sob `/app` (já protegido). Sem necessidade de novo layout.

Pronto para implementar?