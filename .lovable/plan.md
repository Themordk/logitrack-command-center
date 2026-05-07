## Ajuste de paginação e performance — Gerar Entradas

### Mudanças em `src/pages/EntradasPage.tsx`

1. **Eliminar N+1**: trocar a query principal por um único `select` com embeds PostgREST (`parceiro:parceiro_id(razaosocial)`, `tipo_entrada:tipo_entrada_id(descricao)`, `itens:documento_entrada_item(count)`), removendo o `Promise.all` por linha. De ~46 requests por página para 1.

2. **Layout com scroll interno**:
   - Container raiz já é `flex flex-col flex-1 min-h-0`.
   - `card-surface` recebe `flex flex-col min-h-0 overflow-hidden`.
   - Tabela é envolvida em `<div class="flex-1 min-h-0 overflow-auto">`.
   - `<thead>` ganha `sticky top-0 z-10` com fundo opaco para permanecer visível durante o scroll.
   - Footer de paginação sempre renderizado (remover condição `totalPages > 1`), mostrando contador + navegação.

3. **Page size = 20** (alinhado ao padrão admin do projeto). Reset de `page` para 1 quando `empresaId`/`armazemId` mudam.

4. **Otimizar `handleGenerate`**: substituir o loop sequencial `for (const docId of docIds)` por uma única query `.in("documento_entrada_id", docIds)` e agrupar em memória.

### Migration Supabase — índices

```sql
CREATE INDEX IF NOT EXISTS idx_doc_entrada_lista
  ON documento_entrada (tenant_id, empresa_id, status, armazem_id, data_emissao DESC);

CREATE INDEX IF NOT EXISTS idx_doc_entrada_item_doc
  ON documento_entrada_item (documento_entrada_id);
```

### Resultado

- 1 request por página (antes ~46).
- Tabela com cabeçalho fixo, scroll interno e paginação sempre visível.
- Geração de movimento mais rápida em seleções grandes.