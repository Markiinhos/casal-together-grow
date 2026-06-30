
# Reestruturação CASAL — Meu Espaço × Nosso Espaço

Vamos transformar o app em duas experiências integradas, com privacidade real garantida no banco e troca de contexto fluida na UI.

## 1. Modelo de dados

Adicionar em todas as tabelas relevantes a coluna:

```
visibility text not null default 'shared'  -- 'private' | 'shared'
```

Tabelas afetadas (já existem todas):
- `transactions`, `credit_cards`, `bank_accounts`, `bank_connections`, `installments`, `future_bills`
- `house_tasks`, `goals`, `events`, `memories`, `wishes`, `dates`
- `habits`, `habit_logs`, `routines`, `routine_items`, `period_goals`
- `health_metrics`, `water_intake`, `workouts`, `health_meals`
- `meal_plans`, `shopping_items`, `recipes`, `categories`

### Regra de migração dos dados existentes

| Módulo | Decisão |
|---|---|
| Finanças (transações, cartões, contas, parcelas, contas futuras) | `shared` (histórico do casal continua visível) |
| Tarefas da casa, metas, eventos, cardápio, lista de compras, receitas, categorias, memórias, wishes, dates | `shared` |
| Hábitos, logs, rotinas, metas de período | `private` do criador |
| Saúde (peso, água, treinos, refeições saúde) | `private` do criador |

### RLS (padrão para todas as tabelas)

```sql
-- SELECT
using (
  (visibility = 'private' and user_id = auth.uid())
  or (visibility = 'shared' and couple_id is not null and is_couple_member(couple_id))
  or (visibility = 'shared' and couple_id is null and user_id = auth.uid())
)
-- INSERT/UPDATE/DELETE: dono sempre pode; parceiro só em 'shared'
```

## 2. Navegação

- **AppHeader**: novo toggle global `👤 Meu / ❤️ Nosso` (salvo em `localStorage` + Context `SpaceProvider`). Visível em todas as telas do app.
- **BottomNav** reorganizada:
  - Início (dashboard contextual ao espaço ativo)
  - 👤 Meu Espaço (hub)
  - ➕ Adicionar (já respeita o espaço ativo no formulário)
  - ❤️ Nosso Espaço (hub atual de Casal)
  - Mais
- **Hub Meu Espaço** (`/app/meu`): grid com Minhas Tarefas, Minha Agenda, Minhas Metas, Minhas Finanças, Meus Hábitos, Minha Saúde.
- **Hub Nosso Espaço** (`/app/nosso`): Finanças do Casal, Agenda, Metas, Cardápio, Compras, Casa (tarefas), Dates, Memórias.
- Menu "Mais" reagrupado em duas seções (Pessoal / Casal / Sistema).

## 3. Filtros nas telas existentes

Todas as queries passam por um helper `applySpaceFilter(query, space, userId, coupleId)`:
- `private` → `.eq('visibility','private').eq('user_id', userId)`
- `shared` → `.eq('visibility','shared').eq('couple_id', coupleId)`

Telas atualizadas: financas, cartoes, contas, tarefas, metas, agenda, cardapio, compras, dates, casal (memórias/wishes), rotina, saude, categorias.

Formulários de criação setam `visibility` automaticamente baseado no espaço ativo, com possibilidade de override (toggle "Privado / Compartilhado" no form).

## 4. Dashboards

`/app/index.tsx` vira contextual:

**Meu Espaço:**
- Resumo financeiro pessoal (saldo das contas/cartões privados)
- Próximas tarefas pessoais
- Próximos eventos pessoais
- Hábitos do dia + streak
- Indicador de saúde (peso atual, água do dia)
- Metas pessoais em andamento

**Nosso Espaço (já existente, ajustado):**
- Finanças do casal
- Tarefas do casal pendentes
- Metas compartilhadas
- Cardápio do dia
- Lista de compras pendente
- Próximos eventos / contas / dates

## 5. Finanças privadas — invisibilidade total

- Conta/cartão/transação `private` não entram em nenhuma query do parceiro.
- `FinanceInsights` e consolidado bancário filtram por `visibility`.
- Sem "soma anônima" — invisível de verdade.

## 6. Detalhes técnicos

- Migration única adicionando `visibility` + backfill + recriação das policies.
- Novo `src/lib/space.tsx` (Context + hook `useSpace()`).
- Novo `src/lib/queries.ts` com helper `spaceFilter`.
- Novos arquivos de rota: `src/routes/app/meu/route.tsx`, `meu/index.tsx`, e telas dedicadas (`meu/tarefas.tsx`, `meu/agenda.tsx`, `meu/metas.tsx`, `meu/financas.tsx`, `meu/habitos.tsx`, `meu/saude.tsx`) reutilizando os componentes existentes em modo `private`.
- `src/routes/app/nosso/route.tsx` como hub do casal (links já existentes).
- AppHeader ganha o `SpaceToggle`.
- BottomNav atualizada.
- `/app/adicionar` herda o espaço ativo.

## 7. Entrega

Implementação em uma única passada conforme solicitado. Após a migration aprovada:
1. Context + toggle + helpers
2. RLS + filtros nas queries
3. Hubs e rotas Meu/Nosso
4. Dashboard dual
5. Ajuste do menu "Mais" e BottomNav

Confirma para eu seguir?
