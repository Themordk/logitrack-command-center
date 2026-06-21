## Ajustes em `src/pages/InventarioItensPage.tsx`

### 1. Corrigir filtro "Divergentes"
Hoje o filtro usa `.gt("divergência", 0)` / `.eq("divergência", 0)`, mas na view `inventario_item_resumo` a coluna `divergência` está sempre `NULL` (mesmo para `CONCLUIDA`), então nenhuma das opções retorna linhas.

Nova semântica baseada em status + valor:
- **SIM (com divergência):** `status = 'DIVERGENTE'` OU `"divergência" > 0`.
  Implementação PostgREST: `query.or('status.eq.DIVERGENTE,"divergência".gt.0')`.
- **NÃO (sem divergência):** apenas itens já contabilizados (`status IN ('CONCLUIDA','AUDITADA')`) e com divergência zero ou nula.
  Implementação: `query.in('status', ['CONCLUIDA','AUDITADA']).or('"divergência".eq.0,"divergência".is.null')`.

Obs.: o nome `divergência` precisa ir entre aspas no filtro `or` por causa do caractere acentuado.

### 2. Novo filtro "Status"
Adicionar um `<select>` ao lado dos filtros atuais com somente os status pelos quais uma tarefa de inventário transita:

- `Todos` (vazio)
- `ATRIBUIDA` (Não contado)
- `EM_ANDAMENTO` (1ª contagem feita)
- `DIVERGENTE`
- `CONCLUIDA`
- `AUDITADA`

Estado: `fStatus`. Aplicação: `if (fStatus) query = query.eq('status', fStatus);`. Incluir nas dependências do `useCallback`/`fetchItens` e resetar página ao buscar.

### 3. Ordenação por coluna (asc/desc)
Tornar o cabeçalho da tabela clicável para ordenar via server-side (Supabase `order`).

- Novo estado: `sortKey` (default `sku`) e `sortDir` (`'asc' | 'desc'`, default `'asc'`).
- Função `toggleSort(key)`: se já é a coluna ativa, inverte `sortDir`; caso contrário define `sortKey=key, sortDir='asc'`.
- Aplicar no `fetchItens`: `query = query.order(sortKey, { ascending: sortDir === 'asc', nullsFirst: false });`
- Incluir `sortKey` e `sortDir` nas deps do `useCallback`.
- Colunas ordenáveis (todas as exibidas, exceto `Ações`):
  `sku, referencia, descricao, rua, predio, nivel, apto, quantidade_requerida, primeira_contagem, segunda_contagem, saldo_final, "divergência", status`.
- UI: envolver o texto do `<th>` em um `<button>` mostrando `ArrowUpDown` (cinza quando inativo) e `ArrowUp`/`ArrowDown` (cor primária) na coluna ativa. Manter o mesmo padrão visual já usado em `src/modules/reports/components/ReportTable.tsx` (ícones lucide `ArrowUpDown`, `ArrowUp`, `ArrowDown`, tamanho 11).

### Itens fora de escopo
- Nenhuma alteração na view `inventario_item_resumo` ou em RPCs.
- Nenhuma mudança em outras rotas/arquivos.
- Sem mudanças no botão "Zerar não contados" nem na lógica de exibição `—`.
