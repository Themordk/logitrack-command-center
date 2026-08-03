# Correção — Quantidade em CX na tela Confirmar Produto (Armazenagem Iniciar)

## Causa raiz (verificada)

A RPC `fn_buscar_dados_armazenagem(p_tenant_id, p_empresa_ids, p_ean)` retorna hoje apenas:
`tarefa_id, produto_id, sku, descricao, lote, validade, fabricacao, qtd_conferida, qtd_armazenada, qtd_a_armazenar, varios_pickings, enderecos_picking`.

Não há `fator_caixa` no retorno e a tela `ArmazenagemIniciarPage.tsx` não tem de onde tirar o fator — por isso os números aparecem só em UN, diferente das demais telas já padronizadas.

## 1. Migration — alterar a RPC

`CREATE OR REPLACE FUNCTION public.fn_buscar_dados_armazenagem` mantendo toda a lógica atual e adicionando:

- na CTE `dados_base`: `p.fator_caixa`;
- na assinatura `RETURNS TABLE`: nova coluna `fator_caixa numeric` (ao final, para não quebrar posicionamento existente);
- no `SELECT` final: `COALESCE(db.fator_caixa, 1) AS fator_caixa`.

Nenhuma outra alteração de lógica, filtros ou ordenação. Sem nova tabela, sem GRANT novo (função já existente).

## 2. Frontend — `src/pages/coletor/ArmazenagemIniciarPage.tsx`

- Adicionar `fator_caixa: number | null` à interface `TarefaResult` (já vem no retorno da RPC — **nenhuma consulta extra**).
- Nos três indicadores (A armazenar, Armazenado, Restante), manter o número em UN com as cores atuais e acrescentar abaixo a linha `= X CX + Y UN` quando `fator_caixa > 1`, exatamente no mesmo padrão de `ArmazenagemItensPage.tsx`.
- `sessionStorage` continua gravando `coletor_armazenagem_qtd_restante` em UN, sem mudança no fluxo seguinte.

## Notas técnicas

- Conversões com `Number(...)`, `Math.floor` e módulo.
- Após a migration, os types do Supabase são regenerados; o ajuste do frontend vem depois.
- Nenhum outro arquivo é alterado.
