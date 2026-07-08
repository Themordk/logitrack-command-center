## Plano: Relatório de Histórico de Movimentações — snapshots reais de saldo

A RPC `rpc_historico_movimento_com_saldo` agora retorna 4 novos campos (`saldo_anterior_origem`, `saldo_posterior_origem`, `saldo_anterior_destino`, `saldo_posterior_destino`). Substituir as 2 colunas atuais (`Saldo Inicial` / `Saldo Final`) por essas 4.

### Arquivos alterados (2)

**1. `src/modules/reports/movimentacoes/movimentacoes.service.ts`**
- No `.map()` do `fetchMovimentacoesReport`, acrescentar os 4 novos campos (`Number(...)` com fallback `null`).
- Manter `saldo_inicial`/`saldo_final` para compatibilidade e não alterar mais nada no service.

**2. `src/modules/reports/movimentacoes/MovimentacoesReportPage.tsx`**
- No array `columns`, remover `saldo_inicial` e `saldo_final` e inserir na mesma posição (após "Quantidade") 4 colunas: `Sld Ant. Orig.`, `Sld Pos. Orig.`, `Sld Ant. Dest.`, `Sld Pos. Dest.` (width 100px, align right).
- Render: valores `null` → "—" em `text-muted-foreground/40`; `Sld Pos. Orig.` em `text-red-400` quando menor que o anterior; `Sld Pos. Dest.` em `text-emerald-400` quando maior; caso contrário `text-foreground`.
- No `exportColumns` (Excel/PDF), mesma substituição usando `fmtNumberBR`, string vazia para `null`.

### Não alterado
- `ReportTable.tsx`, `ReportHeader.tsx`, `exporters.ts`, rotas, filtros, RPC, detalhe da tarefa.
- Nenhum arquivo/componente/dependência novo.
