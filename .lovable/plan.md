## Objetivo

Alterar a função `gerar_onda_separacao` para que a prioridade da onda seja definida automaticamente a partir do campo `prioridade` da tabela `tipo_saida` (vinculado ao documento de saída), em vez de receber o valor pelo parâmetro `p_prioridade`.

## Backend (Supabase)

Migration ajustando a função `gerar_onda_separacao`:

- Remover o uso do parâmetro `p_prioridade` na lógica interna (mantido na assinatura por compatibilidade, mas ignorado — ou removido caso preferível).
- Dentro da função, para cada documento processado (ou no cabeçalho da onda), obter a prioridade via:
  ```sql
  SELECT ts.prioridade
  FROM documento_saida ds
  JOIN tipo_saida ts ON ts.id = ds.tipo_saida_id
  WHERE ds.id = <doc_id>
  ```
- Quando múltiplos documentos forem incluídos na mesma onda, adotar a **maior prioridade** entre os tipos de saída dos documentos selecionados (ex.: URGENTE > ALTA > NORMAL > BAIXA).
- Fallback para `NORMAL` caso o `tipo_saida.prioridade` esteja nulo.

Confirmar via `read_query` a estrutura atual de `tipo_saida.prioridade` (enum/text) e da assinatura atual da função antes de escrever a migration.

## Frontend (`src/pages/SaidasPage.tsx`)

- Remover o campo **Prioridade** do modal "Gerar Onda de Carregamento" (o select e a validação obrigatória).
- Remover `prioridade` do `formData` e da chamada RPC (`p_prioridade` deixa de ser enviado, ou envia `null`).
- Adicionar nota informativa no modal: "A prioridade será definida automaticamente pelo tipo de saída dos documentos selecionados."

## Detalhes técnicos

- Função-alvo: `public.gerar_onda_separacao(p_tenant_id, p_empresa_id, p_usuario_id, p_documentos uuid[], p_box_id, p_rota_id, p_veiculo_id, p_prioridade)`.
- Campo consultado: `public.tipo_saida.prioridade`.
- Regra de agregação sugerida entre múltiplos documentos: ranking `URGENTE=4, ALTA=3, NORMAL=2, BAIXA=1` → `MAX`.
- Manter o parâmetro `p_prioridade` na assinatura para não quebrar chamadas existentes; apenas descartá-lo internamente.
