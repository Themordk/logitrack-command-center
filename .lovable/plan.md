## Plano — Adendo do módulo de Ocorrências no Dashboard

Aplicar o adendo para refletir o novo retorno JSONB da RPC `dashboard_ocorrencias` (resumo + por_tipo + por_etapa).

### Arquivos alterados

1. **`src/pages/dashboard/dashboard.service.ts`**
   - Remover a interface antiga `OcorrenciaItem` (`motivo_id`, `descricao`, `quantidade`).
   - Adicionar tipos `OcorrenciaResumo`, `OcorrenciaTipo`, `OcorrenciaEtapa`, `OcorrenciasResult`.
   - Adicionar constantes `LABELS_TIPO_OCORRENCIA` e `LABELS_ETAPA_OCORRENCIA`.
   - Reescrever `fetchOcorrencias` para retornar `OcorrenciasResult` (sem parâmetro `p_limite`, com fallback vazio em caso de erro).

2. **`src/pages/Dashboard.tsx`**
   - Trocar o state `ocorrencias` de `OcorrenciaItem[]` para `OcorrenciasResult | null`.
   - Ajustar import (substituir `OcorrenciaItem` por `OcorrenciasResult`).
   - Inicializar com `null` em vez de `[]`.
   - Passar `data={ocorrencias}` diretamente para `<OcorrenciasChart>` (remover o `.map`).

3. **`src/pages/dashboard/components/OcorrenciasChart.tsx`** — substituição completa
   - Novo header com badge de "críticas" (vermelho) quando `resumo.criticas > 0`.
   - Linha de indicadores: pendentes (vermelho), em investigação (amarelo), resolvidas (verde).
   - Gráfico de barras horizontal por tipo de ocorrência, com paleta `CORES_TIPO` por enum.
   - Tooltip customizado mostrando total + pendentes.
   - Estados de loading (skeleton 240px) e vazio ("Nenhuma ocorrência no período ✓").
   - Usa `LABELS_TIPO_OCORRENCIA` para nomes legíveis em PT.

### Notas

- Nenhuma migração de banco — a RPC já foi atualizada.
- `por_etapa` fica disponível no tipo mas não é renderizado nesta versão (mantemos para uso futuro, sem dead-code visual).
- Sem alterações nas demais RPCs (KPIs, Ranking, Tendência), filtros ou rotas.
