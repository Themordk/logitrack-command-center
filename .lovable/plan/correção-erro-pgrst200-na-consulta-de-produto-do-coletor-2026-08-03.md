# Correção — erro PGRST200 na consulta de produto do coletor

## Causa confirmada

Consultei as constraints da tabela `endereco`: existem apenas FKs para `armazem`, `empresa` e `tenant`. **Não há FK entre `endereco` e `tipo_estoque`**, então o embed `tipo_estoque:tipo_estoque_id(descricao)` usado em `/coletor/consulta/produto` falha com PGRST200 — mesmo padrão já conhecido do caso `endereco`/`setor`.

## Correção

Em `src/pages/coletor/ConsultaProdutoPage.tsx`:

1. Remover o embed aninhado do select em `estoque_geral`, mantendo apenas `endereco:endereco_id(descricao, tipo_endereco, tipo_estoque_id)`.
2. Coletar os `tipo_estoque_id` distintos retornados e buscar as descrições em uma segunda consulta (`tipo_estoque` com `in`), montando um mapa id → descrição.
3. Preencher `tipo_estoque_desc` a partir desse mapa, com fallback `"—"` quando o endereço não tiver tipo de estoque.

A UI (badge do tipo de estoque, conversão CX/UN, seções Pulmão/Picking/Outros) permanece igual — muda apenas a forma de obter o dado.

## Nota técnica

Sem migração: não vamos criar a FK, mantendo o padrão do projeto de resolver esse join manualmente no frontend.
