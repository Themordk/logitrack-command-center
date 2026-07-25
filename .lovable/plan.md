
# Revisão Tipos de Tarefa + LMS + Reorganização de Configurações

Migration já aplicada no banco (novos campos em `tipo_tarefa` e `motivo_ocorrencia`). Aplicar apenas mudanças de frontend conforme prompt.

## 1. `src/pages/TiposTarefaPage.tsx` — Refatoração completa

**Interface `TipoTarefa`**: substituir por: `id, codigo, descricao, ativo, categoria, tipo_movimento, tempo_estimado_segundos, meta_unidades_hora, meta_tarefas_hora, unidade_medida, peso_produtividade, cor_interface, empresa_id`. Remover `prioridade_padrao`, `gera_movimento_estoque`, `bloqueia_estoque`, `exige_conferencia`.

**Colunas do grid** (ordem):
- `codigo` (mono), `descricao`
- `categoria` — badge colorido por valor (10 cores mapeadas: RECEBIMENTO=azul, ARMAZENAGEM=roxo, SEPARACAO=âmbar, CONFERENCIA=teal, EXPEDICAO=verde, ABASTECIMENTO=laranja, INVENTARIO=ciano, MOVIMENTACAO=índigo, AUDITORIA/OUTROS=cinza)
- `tipo_movimento` (mantém Entrada/Saída/Transferência)
- `tempo_estimado_segundos` → label "SET (s)"
- `meta_unidades_hora` → `{valor} {unidade_medida}/h` ou "—"
- `peso_produtividade` → número 1 casa decimal
- `ativo` → StatusBadge Sim/Não

**Modal `TipoTarefaEditModal`** — reorganizado em 2 seções separadas por `border-t border-border`:

- **Seção 1 — "Configuração operacional"**: `codigo` (disabled), `descricao` (disabled), `categoria` (select 10 valores), `tipo_movimento` (select existente), `ativo` (switch)
- **Seção 2 — "Parâmetros de produtividade (LMS)"**: `tempo_estimado_segundos`, `meta_unidades_hora`, `meta_tarefas_hora`, `unidade_medida` (text), `peso_produtividade` (number step 0.1), `cor_interface` (`<input type="color">` com swatch 24x24 ao lado; default `#6366f1`)

Grid `grid-cols-1 md:grid-cols-2 gap-4`; input de cor ocupa 1 coluna própria. Payload atualizado sem os 4 campos removidos.

## 2. `src/pages/MotivosOcorrenciaPage.tsx` — Campos SLA

- Adicionar em `fields` (antes de `ativo`): `sla_horas` (number, "SLA (horas)") e `sla_notificar_percentual` (number, "Alerta em (% do SLA)", default 80).
- Adicionar em `columns` (antes de `ativo`): `sla_horas` renderizado como `{n}h` ou "—".

## 3. Reorganização de menu

**`src/components/TopNav.tsx`**:
- Remover `SLA de Ocorrências` de Configurações.
- Remover `Motivos de Ocorrência` do menu Armazém.
- Menu Configurações fica: Empresas, Usuários, Perfis de Acesso, Tipos de Tarefa, **Motivos de Ocorrência**, Integração ERP, Roteiro de Separação.

**`src/App.tsx`**:
- Remover import e `case "/config/ocorrencia-sla"` + entrada do breadcrumbMap.
- Renomear `case "/armazem/motivos"` para `case "/config/motivos-ocorrencia"` mantendo o antigo como alias (compatibilidade).
- Adicionar breadcrumb: `"/config/motivos-ocorrencia": [CORE LogiTrack, Configurações, Motivos de Ocorrência]`.

Arquivo `OcorrenciaSlaConfigPage.tsx` permanece no repo (sem rota).

## 4. Notas técnicas

- Sem alterações em `src/pages/coletor/*`, `src/modules/reports/*`, ou schema.
- Types do Supabase são regenerados automaticamente pela Lovable; código usa cast `(supabase as any)` já presente, então não bloqueia.
- Nenhum novo componente — reutiliza CrudTable, StatusBadge, Switch, Dialog.
