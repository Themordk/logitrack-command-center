# Correção — Quantidade em CX na tela Confirmar Produto (Armazenagem Iniciar)

## Causa raiz (verificada)

A RPC `fn_buscar_dados_armazenagem(p_tenant_id, p_empresa_ids, p_ean)` retorna apenas:
`tarefa_id, produto_id, sku, descricao, lote, validade, fabricacao, qtd_conferida, qtd_armazenada, qtd_a_armazenar, varios_pickings, enderecos_picking`.

Não há `fator_caixa` no retorno, e a `ArmazenagemIniciarPage.tsx` também não faz nenhuma consulta complementar. Por isso a tela mostra apenas números em UN, diferente de `ArmazenagemItensPage` e demais telas já padronizadas.

## Correção (somente frontend, sem migration)

Em `src/pages/coletor/ArmazenagemIniciarPage.tsx`:

1. Após obter a tarefa, buscar `fator_caixa` em `produto` pelo `produto_id` retornado, e guardar no estado.
2. Quando o código escaneado for um EAN, buscar também `embalagem` e `fator` em `produto_embalagem` pelo EAN, para identificar a embalagem escaneada (no caminho por HU, usar UN / fator 1).
3. Exibir no card, seguindo o padrão das outras telas:
   - Bloco "Embalagem escaneada" (ícone `Box`, badge azul quando fator > 1, linha "Fator: N UN por EMB"), igual ao usado em Transferência Detalhe.
   - Substituir os três números (A armazenar, Armazenado, Restante) pelo componente `QtdEmCaixa` (`size="sm"`, `align="center"`), preservando as cores atuais via wrapper — ou, se a cor for necessária por número, manter o número principal e adicionar a linha `= X CX + Y UN` abaixo, exatamente como em `ArmazenagemItensPage`.
4. Continuar gravando em `sessionStorage` a quantidade restante **em UN** (`coletor_armazenagem_qtd_restante`), sem alteração no fluxo seguinte.

## Notas técnicas

- Consultas simples via `supabase.from("produto").select("fator_caixa")` e `from("produto_embalagem").select("embalagem, fator").eq("ean", code)`, sem embeds aninhados (evita PGRST200).
- Conversões com `Number(...)`, `Math.floor` e módulo.
- Nenhum outro arquivo é alterado.
