# Patrimônio e Dívidas dentro de Estrutura

## Objetivo
Adicionar duas áreas de acompanhamento manual — **Investimentos** e **Dívidas** — dentro de Estrutura, sem alterar receitas, despesas, saldos, cartões, faturas, orçamento, projeção ou assinaturas.

## Implementação

### 1. Navegação da Estrutura
- Preservar a tela atual em `/app/financas/estrutura`.
- Adicionar acessos claros para **Investimentos** e **Dívidas**.
- Criar páginas próprias para cada área, mantendo o padrão visual e os controles já usados no CASAL.

### 2. Base de dados isolada
- Criar tabelas próprias para investimentos, dívidas e pagamentos de dívidas.
- Incluir proprietário, casal, visibilidade e responsável em cada registro aplicável.
- Aplicar permissões para que dados privados pertençam somente ao usuário e dados compartilhados sejam vistos apenas pelo casal correto.
- Garantir que nenhuma operação dessas tabelas crie ou altere lançamentos, contas, cartões, faturas, orçamentos ou projeções.

### 3. Investimentos
- Permitir adicionar, editar, excluir e consultar registros.
- Campos: responsável, instituição, tipo, nome, valor investido, data, rendimento informado e observação.
- Exibir lista em cards com responsável, instituição/tipo, valor e rendimento informado.
- Não exibir patrimônio líquido nem somatória geral obrigatória.

### 4. Dívidas
- Permitir adicionar, editar, excluir e consultar dívidas.
- Campos: responsável, credor, descrição, valor original, data de criação, status e observação.
- Calcular valor pago e restante exclusivamente a partir do histórico de pagamentos.
- Registrar, editar e excluir pagamentos com valor, data e observação.
- Marcar automaticamente como quitada quando o restante chegar a zero e reabrir se um pagamento for reduzido ou removido.
- Impedir pagamentos que façam o total pago ultrapassar o valor original.

### 5. Resumo e plano de quitação
- Mostrar dívidas abertas por pessoa, total do casal, total pago, total restante e percentual quitado.
- Destacar a meta **“Zerar todas as dívidas”** com barra de progresso e mensagem de conclusão.
- Agrupar pagamentos por mês e por responsável em **Plano para limpar o nome**.
- Exibir um gráfico simples da evolução do saldo restante.
- Estimar os meses para quitação usando a média mensal dos pagamentos registrados, deixando claro que é apenas uma estimativa; sem pagamentos, informar que ainda não há base para previsão.

## Detalhes técnicos
- Transformar a rota atual de Estrutura em uma rota-pai com página inicial própria, preservando a URL atual e adicionando rotas filhas para investimentos e dívidas.
- Usar os componentes, tokens, espaço privado/compartilhado e identificação de pessoas já existentes.
- Usar operações atômicas no banco para manter saldo e status das dívidas coerentes após inserir, editar ou excluir pagamentos.
- Adicionar metadados próprios para as três páginas.

## Validação
- Confirmar criação, edição, exclusão e leitura nos espaços privado e compartilhado.
- Confirmar o isolamento entre casais e usuários.
- Testar pagamento parcial, quitação, reabertura, resumo, agrupamento mensal e previsão.
- Verificar explicitamente que nenhuma tabela do financeiro principal é alterada.
- Validar a aplicação e conferir as telas em desktop e celular.
