## Objetivo

Refinar a tela `/atividades/inventario/novo` (`src/pages/NovoInventarioPage.tsx`) e o backend de inventário rotativo para:
1. Permitir que os critérios CORTES e ESTORNOS considerem um período de análise informado pelo usuário.
2. Aplicar defaults sensatos nos campos da tela.
3. Garantir que `Máx. Endereços/Dia` realmente limite a geração de tarefas.
4. Corrigir a fonte dos ESTORNOS (deve ser `tarefa_execucao` com `status = 'CANCELADA'`, e não `estoque_movimento`).

---

## a) Período de análise (CORTES / ESTORNOS)

### UI
- Adicionar, abaixo dos radios de critério (apenas quando `criterio === 'CORTES'` ou `'ESTORNOS'`), um campo **Período de análise** (select) com as opções:
  - `HOJE` — Data atual
  - `ONTEM` — Dia anterior
  - `7D` — Última semana
  - `15D` — Últimos 15 dias
  - `30D` — Último mês (default)
- O período é obrigatório quando o critério exige (incluir na validação `isValid` e no preview de Resumo).
- Resolver o intervalo `[data_inicio, data_fim]` no frontend (usando `src/utils/dateTime.ts` para America/Fortaleza) e enviar como `p_data_inicio_analise` / `p_data_fim_analise` para o RPC.

### Backend (migration)
- Adicionar colunas em `public.inventario`:
  - `data_inicio_analise date NULL`
  - `data_fim_analise date NULL`
- Recriar `fn_criar_inventario_v2` com dois parâmetros novos (`p_data_inicio_analise date DEFAULT NULL`, `p_data_fim_analise date DEFAULT NULL`) gravando essas colunas. Adicionar validação: quando `tipo='ROTATIVO'` e `criterio_selecao IN ('CORTES','ESTORNOS')`, ambas as datas são obrigatórias (`PERIODO_OBRIGATORIO`).
- Recriar `fn_gerar_tarefas_inventario` substituindo o trecho hardcoded `interval '30 days'`:
  - **CORTES**: continua em `estoque_movimento` (movimento negativo) mas filtrando `criado_em` no intervalo `[data_inicio_analise, data_fim_analise + 1 day)`.
  - **ESTORNOS**: trocar a fonte para `tarefa_execucao` (status `'CANCELADA'`) no mesmo intervalo, retornando o `produto_id` distinto que aparece nessas execuções. (A relação produto/execução vem de `tarefa_execucao → tarefa.produto_id`.)

### Mapeamento de erros
- Adicionar `PERIODO_OBRIGATORIO: "Selecione o período de análise."` em `ERROR_MAP`.

---

## b) Defaults e enforcement na tela

1. **Data Planejada** — inicializar `dataPlanejada` com a data atual (formato `YYYY-MM-DD`, fuso Fortaleza via `src/utils/dateTime.ts`). Permanece editável.
2. **Toggle "Bloquear movimentações..."** — alterar default de `useState(true)` para `useState(false)`.
3. **Máx. Endereços/Dia** — hoje o valor é gravado em `inventario.max_enderecos_dia` mas **não é aplicado** em `fn_gerar_tarefas_inventario`. Ajustar a função para, quando `max_enderecos_dia IS NOT NULL`, encerrar a geração ao atingir esse número de endereços distintos já com tarefa para o inventário. Implementação:
   - No CTE `dados_origem`, calcular o nº de endereços distintos já existentes em `tarefa` para o `id_documento_origem = p_inventario_id`.
   - Limitar o chunk para que `(distintos_existentes + distintos_novos) <= max_enderecos_dia`; quando alcançar, retornar `finalizado=true`.
4. **Toggle "Priorizar endereços de Picking"** — alterar default de `useState(false)` para `useState(true)`.

---

## Detalhes técnicos

**Arquivos frontend**
- `src/pages/NovoInventarioPage.tsx`
  - Novos estados: `periodoAnalise` (string, default `"30D"`).
  - Helper local `resolvePeriodo(opt)` → `{ inicio, fim }` (datas ISO em Fortaleza).
  - Defaults atualizados: `bloquearMov=false`, `priorizarPicking=true`, `dataPlanejada=hoje`.
  - Renderizar campo período apenas quando `criterio` for CORTES/ESTORNOS; resetar `periodoAnalise` para `"30D"` quando o critério muda.
  - `handleSave`: incluir `p_data_inicio_analise` e `p_data_fim_analise` no payload.
  - Atualizar `isValid` e o `useEffect` de preview para considerar `periodoAnalise` quando aplicável.

**Migration**
```sql
ALTER TABLE public.inventario
  ADD COLUMN IF NOT EXISTS data_inicio_analise date,
  ADD COLUMN IF NOT EXISTS data_fim_analise    date;

-- Recriar fn_criar_inventario_v2 (assinatura com 2 novos params, NULL default)
-- Recriar fn_gerar_tarefas_inventario:
--   • CORTES: estoque_movimento (tipo_movimento<0) filtrando criado_em no período
--   • ESTORNOS: tarefa_execucao (status='CANCELADA') JOIN tarefa para obter produto_id,
--               filtrando tarefa_execucao.criado_em no período
--   • Enforcement de max_enderecos_dia limitando endereços distintos por inventário
```

Sem mudanças de GRANT (colunas em tabela existente, funções recriadas com `SECURITY DEFINER`).

---

## Fora de escopo
- Tela de detalhe/listagem de inventário (sem alterações).
- Outras rotas administrativas.
- Lógica de recontagem / divergências.
