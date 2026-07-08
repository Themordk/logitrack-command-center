Migrar os dois services de relatório para chamar as RPCs prontas do backend, substituindo a lógica de múltiplas queries + agregação no frontend por 1 chamada RPC + mapeamento.

## Arquivos

### 1. `src/modules/reports/recebimento/recebimento.service.ts`
Reescrever `fetchRecebimentoReport` para chamar `rpc_relatorio_dock_to_stock` com params `p_tenant_id`, `p_empresa_id`, `p_armazem_id`, `p_data_inicio`, `p_data_fim`, `p_sla_horas`. Mapear retorno para `RecebimentoRow` (todos os campos t0..t5, tempos, status_sla, sla_horas, perc_sla). Manter filtros client-side (parceiro_id, status_sla, apenas_concluidos), ordenação por pior SLA, e cálculo de KPIs a partir dos rows.

Manter: interfaces `RecebimentoFilter`, `RecebimentoRow`, `RecebimentoKpis`, type `StatusSla`, `emptyKpis()`, `formatDuration()`.
Remover: helpers `diffMin`, `classifySla` (não usados mais).

### 2. `src/modules/reports/ciclo-pedido/cicloPedido.service.ts`
Reescrever `fetchCicloPedidoReport` para chamar `rpc_relatorio_ciclo_pedido` com params `p_tenant_id`, `p_empresa_id`, `p_armazem_id`, `p_data_inicio`, `p_data_fim`, `p_status_onda`, `p_prioridade`, `p_sla_horas`. Mapear retorno para `CicloPedidoRow`, calcular `pior_etapa` por linha (Fila/Picking/Conferência/Pós-Conferência). Manter filtros client-side, ordenação e agregação de KPIs.

Manter: interfaces `CicloPedidoFilter`, `CicloPedidoRow`, `CicloPedidoKpis`, types `StatusSla`/`PiorEtapa`, `emptyKpis()`, `formatDuration()`.
Remover: helpers `diffMin`, `classifySla`.

## Fora de escopo
Páginas `.tsx`, outros services, componentes, exporters, RPCs no Supabase, App.tsx, dependências. Nenhuma outra função exportada (`fetchParceirosEntrada`, etc.) será alterada.
