# Correção — Inventário do tenant JRLUB (FJG DISTRIBUIDORA / CD Principal)

## O que foi verificado no banco

Consultas feitas agora para o tenant JRLUB (empresa FJG DISTRIBUIDORA, armazém CD Principal):

- `inventario_tipo_tarefa`: **0 registros** para este tenant. Os tipos de tarefa `INV-AUDIT` (INVENTÁRIO-AUDITORIA) e `INV-ATU` (INVENTÁRIO-ATUALIZAÇÃO) existem em `tipo_tarefa`, mas não estão vinculados aos tipos de execução AUDITORIA/ATUALIZAÇÃO.
- `estoque_geral`: **0 posições** neste tenant. O armazém CD Principal possui apenas 2 endereços cadastrados, ambos sem saldo.
- `produto`: 403 produtos cadastrados.

## Causas identificadas

1. **Não consegue criar inventário**: a tela faz uma pré-checagem em `inventario_tipo_tarefa` antes de chamar a RPC. Como não há vínculo cadastrado, ela lança `TIPO_TAREFA_NAO_CONFIGURADO` e a criação é abortada. A mesma validação existe dentro de `fn_gerar_tarefas_inventario`, então nem por outro caminho funcionaria.
2. **Resumo com SKU e Endereços zerados**: a prévia conta posições de `estoque_geral` filtradas por empresa + armazém. Como não existe nenhuma posição de estoque neste armazém, o resultado é legitimamente 0/0 — mas a tela não explica isso, apenas mostra zero.
3. **Agravante de UX**: o cálculo da prévia está dentro de um `try/catch` que engole qualquer erro e devolve 0/0, e alguns caminhos saem antes sem desligar o estado de carregando, deixando números antigos na tela. Isso torna impossível distinguir "sem estoque" de "erro na consulta".

## O que será feito

### 1. Migration — vincular tipos de tarefa de inventário
Inserir em `inventario_tipo_tarefa` os vínculos faltantes para o tenant JRLUB:
- AUDITORIA → `INV-AUDIT`
- ATUALIZACAO → `INV-ATU`

A migration será escrita de forma genérica: para qualquer tenant que já possua os tipos de tarefa da categoria INVENTARIO mas não tenha o vínculo, o registro é criado (idempotente, sem duplicar os tenants já configurados).

### 2. Tela Novo Inventário — diagnóstico visível
Em `src/pages/NovoInventarioPage.tsx`:
- Diferenciar os três estados do Resumo: **calculando**, **sem posições de estoque no armazém selecionado** e **erro ao calcular** (com a mensagem real, via `parseError`), em vez de sempre mostrar 0.
- Alinhar a prévia à regra da geração: contar apenas posições com `quantidade_total > 0` e aplicar o filtro de empresa também nas consultas auxiliares de produto (grupo e curva).
- Corrigir os retornos antecipados para zerar/limpar o estado de carregando ao trocar de tipo ou limpar a seleção.
- Quando o resumo indicar 0 endereços (exceto no tipo GERAL, que é contagem livre), exibir um aviso claro acima do botão informando que nenhuma tarefa será gerada, evitando criar inventários vazios.

### 3. Mensagem de erro na criação
Garantir que a falha `TIPO_TAREFA_NAO_CONFIGURADO` apareça em destaque no formulário (não apenas em toast, que pode passar despercebido), indicando o caminho de configuração.

## Observação importante

Mesmo após a correção, o armazém CD Principal continuará gerando **0 tarefas** de inventário enquanto não houver saldo em `estoque_geral` — o motor de inventário só cria tarefas para posições com estoque. Para testar o fluxo completo será necessário ter recebimento/armazenagem concluídos nesse armazém, ou usar o tipo **Geral (contagem livre)**, que não depende de tarefas pré-geradas.

## Detalhes técnicos

- Arquivos: `src/pages/NovoInventarioPage.tsx` (UI e prévia) + uma migration em `supabase/migrations`.
- Nenhuma alteração em `fn_criar_inventario_v2` ou `fn_gerar_tarefas_inventario`.
