## Objetivo
Corrigir a paginação em `Atividades → Gerar Saída` (`src/pages/SaidasPage.tsx`) para mostrar todos os documentos, alinhando o comportamento ao de `Atividades → Gerar Entrada` (`src/pages/EntradasPage.tsx`).

## Problemas identificados em SaidasPage
1. `pageSize = 15` (Entradas usa 20).
2. Rodapé de paginação só aparece quando `totalPages > 1`, escondendo o contador "X documentos" e impedindo navegação quando o cálculo de total estiver inconsistente.
3. Botão "Próximo" usa `disabled={page === totalPages}` — quando `totalPages = 0` (loading inicial / vazio) trava em estados estranhos.
4. Falta `useEffect` para resetar `page` ao trocar `empresaId`/`armazemId`, podendo deixar `page` fora do range e exibir lista vazia.
5. Enriquecimento via `Promise.all` por linha (N+1) — não é o foco, mas será trocado pelo padrão embed da Entradas para garantir contagem correta de SKUs e nome do parceiro sem múltiplas requisições.

## Mudanças (apenas frontend)
Arquivo: `src/pages/SaidasPage.tsx`

1. `pageSize`: 15 → **20**.
2. Trocar enriquecimento por select com embed (mesmo padrão de Entradas):
   ```ts
   .select(`id, numero_pedido, data_emissao, parceiro_id, valor_pedido,
            parceiro:parceiro_id ( razaosocial ),
            itens:documento_saida_item ( count )`,
           { count: "exact" })
   ```
   e mapear `parceiro_nome` / `total_skus` a partir do retorno.
3. Adicionar `useEffect(() => { setPage(1); }, [empresaId, armazemId]);`.
4. Renderizar o rodapé de paginação **sempre** (remover `totalPages > 1`), exibindo `{total} documento(s)` e `page / Math.max(1, totalPages)`.
5. Botão "Próximo": `disabled={page >= totalPages}`.

## Fora de escopo
- Lógica de geração de onda, modal, importação ERP.
- Backend / RLS / migrations.
