Aplicar as duas correções pontuais nos services conforme spec.

## Arquivos

### 1. `src/modules/reports/recebimento/recebimento.service.ts`
Adicionar `.eq("tenant_id", filters.tenant_id)` na query de `tipo_tarefa` para `ENTR-ARMZ`.

### 2. `src/modules/reports/ciclo-pedido/cicloPedido.service.ts`
- Adicionar `.eq("tenant_id", filters.tenant_id)` na query de `tipo_tarefa` (`SEP`, `SEP-CONF`).
- Remover `oc3` (t4f→t5) do cálculo de `tempo_ocioso_min`; somar apenas `oc1 + oc2`.

## Fora de escopo
Nenhuma outra alteração — sem tocar em páginas .tsx, outros services, componentes, RPCs, App.tsx ou dependências.