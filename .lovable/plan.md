Você quer todas as 4 fases. Esse escopo (14 módulos + storage + integrações) não cabe num único turno sem quebrar o app — vou entregar **uma fase por turno**, validando o build entre elas. Aprovando este plano, começo pela Fase 1 já neste próximo turno.

## Fase 1 — Base visual e correções (próximo turno)

**1.1 Foto do casal**
- Bucket privado `couple_photos` + policies (membros do casal leem/escrevem fotos do próprio `couple_id`)
- Coluna `couples.photo_url`
- Componente `CoupleAvatarUploader` (upload/alterar/remover) no perfil do casal
- Exibição na Dashboard (header) e na tela de perfil

**1.2 CRUD de categorias**
- Auditar tabela `categories` e RLS (provavelmente falta INSERT/UPDATE/DELETE policy para membros do casal)
- Tela `/app/categorias`: criar, editar, excluir com nome, cor (color picker) e ícone (lucide picker)
- Corrigir o que estiver bloqueando hoje

**1.3 Preservar histórico ao entrar no casal**
- Auditar `join_couple_by_code` — hoje só atualiza `profiles.couple_id`, não migra registros anteriores do usuário (transactions, tasks, goals, memories…)
- Estender a function para fazer `UPDATE … SET couple_id = v_couple_id WHERE user_id = v_user AND couple_id IS NULL` em cada tabela relevante
- Garantir que tabelas user-owned aceitem `couple_id NULL` (uso solo) e sejam migradas no join

**1.4 Menção @Parceiro (in-app + badge)**
- Componente `MentionTextarea` que detecta `@parceiro` ao digitar
- Ao salvar item (task, transaction, memory) com menção: insere em `notifications` com `ref_table`/`ref_id`
- Badge no sino do header (contagem de `read = false`)
- Clique na notificação → navega ao item; marca como lida
- (Sem Web Push — apenas in-app conforme escolhido)

## Fase 2 — Finanças avançadas (turno seguinte)
- Tabelas `credit_cards` (couple_id, name, bank, limit_amount, closing_day, due_day, owner_id) e `installments` (transaction_id, n, total, amount, due_date)
- Trigger/server-fn: ao criar transação parcelada → gera N linhas em `installments`
- Tabela `future_bills` (recorrência: mensal/semanal/anual)
- Telas: lista de cartões por dono, fatura atual/próxima, parcelas restantes, contas futuras com alertas no dashboard

## Fase 3 — Vida a dois (turno seguinte)
- `meal_plans` (semana × refeição × prato) + favoritos + duplicar semana
- `shopping_list` gerada do cardápio + categorias (mercado/hortifruti/açougue/farmácia) + check-off
- `dates` (planejador) com status + galeria vinculada
- `memory_albums` + `memories` (já existe — adicionar álbuns + timeline) usando bucket `couple_memories`

## Fase 4 — Saúde + Mercado Pago (turno seguinte)
- `health_metrics` (peso, altura, IMC calculado, meta), `water_intake`, `workouts`
- `meals` (refeição, foto, calorias, observações)
- Mercado Pago via API oficial: OAuth (App ID + Client Secret do usuário), tabela `bank_connections`, server-fn que importa saldo/movimentações para `transactions` com flag `imported_from='mercadopago'`
- Você precisará criar uma aplicação em mercadopago.com/developers e me passar `MP_CLIENT_ID` e `MP_CLIENT_SECRET` quando chegarmos nessa fase

## Widgets do Dashboard
Adicionados incrementalmente conforme cada módulo entra: Fase 2 traz "próximas contas/parcelas", Fase 3 traz "próximo date/cardápio de hoje/última memória", Fase 4 traz "água hoje". "Meta principal" entra na Fase 1.

---

**Aprova começar pela Fase 1 agora?** Posso ajustar qualquer item antes de começar.