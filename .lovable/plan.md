## Diagnóstico

**Top Operadores** (`fetchTopOperadores` em `dashboard.service.ts`)
- Hoje consulta `lms_metrica_diaria` — tabela está **vazia** (0 linhas), por isso o painel exibe placeholders/dados fictícios.
- A fonte correta de "tarefas concluídas por usuário" é `tarefa_execucao` (status `CONCLUIDA`, `concluido_em` no período), conforme indicado pelo usuário. Já existem 18 execuções concluídas.

**Ocorrências Operacionais** (`fetchOcorrencias`)
- Já consulta `tarefa_execucao` filtrando `motivo_ocorrencia IS NOT NULL` no período, agregando pela descrição do motivo. Lógica está correta — apenas validar e manter.

**Layout (referência da imagem)**
- A imagem reflete o layout já existente (avatar com iniciais, nome, contagem de tarefas, barra de progresso à direita). Apenas garantir que os dados venham reais e a barra de progresso seja proporcional ao líder do ranking.

## Mudanças

### 1. `src/pages/dashboard/dashboard.service.ts`
Reescrever `fetchTopOperadores`:
- Query: `tarefa_execucao` filtrando `tenant_id`, `status='CONCLUIDA'`, `concluido_em` entre `dataIni 00:00:00` e `dataFim 23:59:59`.
- Filtro adicional opcional por `armazem_id`/`empresa_id` via join na `tarefa` (usar select aninhado `tarefa:tarefa_id(armazem_id, empresa_id)` e filtrar em memória, já que `tarefa_execucao` não tem esses campos diretamente).
- Resolver o nome do operador via `usuario:usuario_id(nome)`.
- Agrupar por `usuario_id`, contar execuções concluídas → `tarefas`.
- Calcular `produtividade` (tarefas/h) usando `iniciado_em`/`concluido_em` somados por usuário (segundos produtivos).
- Ordenar desc por `tarefas`, `slice(0, limit)`.
- Retornar shape compatível com `RankingOperadores`: `{ id, nome, tarefas, produtividade }`.

Manter `fetchOcorrencias` como está (apenas validado).

### 2. `src/pages/dashboard/components/RankingOperadores.tsx`
- Adicionar barra de progresso horizontal à direita do nome (proporcional ao líder), conforme imagem.
- Manter avatar com iniciais (gerar a partir do nome) ao invés do ícone genérico para os fora do pódio — alinhado à imagem (badges JR, MS, CA, FL).
- Manter contagem de tarefas alinhada à direita.

### 3. `Dashboard.tsx`
Sem alteração estrutural. Apenas garantir que o painel recarregue ao mudar filtros (já implementado via `dfArgs`).

## Detalhes técnicos

- `tarefa_execucao` não possui `empresa_id`/`armazem_id`. Para filtrar por armazém, fazer select aninhado `tarefa:tarefa_id(armazem_id)` e filtrar `r.tarefa?.armazem_id === f.armazemId` no client (consistente com padrão usado em outras partes).
- Produtividade: `segundos = sum(EXTRACT EPOCH FROM (concluido_em - iniciado_em))` agregado em JS após o fetch.
- Avatar com iniciais: pegar primeira letra do primeiro e último token do nome (`João Ribeiro → JR`).
- Barra de progresso: `width = (op.tarefas / max(tarefas)) * 100%`, fundo `bg-secondary/40`, preenchimento `bg-primary`.
