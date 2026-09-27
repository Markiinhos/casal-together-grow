# Estrutura integrada de planejamento financeiro do casal

## Objetivo

Ampliar o Financeiro sem substituir contas, cartões, faturas, transações, assinaturas, categorias, planejamento mensal ou projeção. A nova área será compartilhada pelo casal e separará claramente valores **previstos** de valores **realizados**, evitando dupla contagem.

## O que será construído

### 1. Fontes de receita
- Criar cadastro compartilhado de fontes recorrentes com nome, pessoa responsável, tipo, valor, frequência, dia de recebimento, status e observação.
- Permitir adicionar, editar, ativar/desativar e excluir.
- Mostrar total mensal equivalente do casal, por pessoa, fixo e variável.
- Usar os nomes reais dos dois perfis nas opções e resumos.

### 2. Despesas fixas
- Evoluir as contas futuras já existentes, em vez de criar uma lista paralela.
- Acrescentar categoria vinculada, responsável (um membro ou ambos), forma de pagamento e status ativo.
- Manter compatibilidade com contas futuras já cadastradas e incorporar assinaturas ativas ao total fixo.
- Permitir filtro por responsável, edição, ativação/desativação e exclusão.

### 3. Despesas variáveis
- Reutilizar os orçamentos por categoria do planejamento mensal e os lançamentos reais existentes.
- Exibir orçamento, gasto realizado, disponível e percentual utilizado por categoria.
- Preservar a regra atual para parcelas, pagamentos de fatura e transferências, sem duplicar lançamentos.

### 4. Visão consolidada
- Criar uma área de planejamento dentro de Finanças com abas para Resumo, Receitas, Fixas e Variáveis.
- Mostrar receitas previstas, despesas fixas previstas, orçamento variável e disponível.
- Manter o resumo financeiro atual como visão realizada; a nova visão será identificada como planejada.
- Adicionar acessos na tela Financeiro sem remover os atalhos atuais.

### 5. Integração com planejamento e projeção
- Preencher a receita prevista do planejamento mensal a partir das fontes ativas, com fallback para o histórico atual.
- Manter reserva, metas e limites já existentes.
- Projetar fontes recorrentes e despesas fixas futuras, junto a assinaturas e parcelas atuais.
- Aplicar uma regra única de precedência por origem para impedir que previsão e lançamento realizado sejam somados duas vezes.

### 6. Estados e validação
- Incluir carregamento, vazio, erro, confirmação de exclusão e atualização imediata após cada alteração.
- Validar valores, frequência, dias válidos e vínculo do responsável ao casal.
- Revisar as telas em formato celular e desktop, inclusive criação, edição, filtros e projeção.

## Alterações nos dados

- Nova tabela para fontes de receita recorrentes, vinculada ao usuário criador, casal e pessoa responsável.
- Ampliação de contas futuras para funcionar como despesa fixa estruturada, preservando registros antigos.
- Políticas de acesso restritas aos membros do casal, permissões explícitas e índices para consultas por casal/status.
- Nenhum dado financeiro ou assinatura existente será convertido, duplicado ou removido.

## Detalhes técnicos

- Reutilizar React Query, filtros de espaço, categorias e componentes visuais existentes.
- Centralizar normalização mensal de frequências: semanal × 52/12, quinzenal × 26/12, mensal × 1 e anual ÷ 12; itens variáveis entram pelo valor informado para a previsão do mês.
- Somar assinaturas somente como despesas fixas previstas; cobranças já materializadas em transações continuam no realizado, nunca nos dois lados do mesmo cálculo.
- Atualizar os tipos gerados após a migração e adicionar metadados próprios às novas páginas.
- Registrar a decisão de fonte única dos cálculos financeiros na documentação técnica do projeto.
