## Plano — Motor de Ondas: Ajustes em Tipos de Saída + Roteiro de Separação

Escopo restrito a 2 arquivos existentes. Nenhuma rota, componente `ui/`, ou dependência nova.

---

### 1. `src/pages/TiposSaidaPage.tsx`

Refletir 3 novos campos da tabela `tipo_saida`:

- **`conferencia_cega`** (bool) — conferência sem exibir quantidade esperada.
- **`gera_volume_etapa`** (enum: `NENHUMA` | `SEPARAÇÃO` | `CONFERÊNCIA` | `CARREGAMENTO`, default `CONFERÊNCIA`).
- **`gera_abastecimento_automatico`** (bool) — dispara abastecimento ao gerar onda.

Alterações:
- **CrudTable columns**: inserir as 3 colunas entre `libera_mov_automatico` e `prioridade`. Booleans usam `boolBadge`; enum usa badge azul customizado.
- **CrudModal fields**: reorganizar array em blocos lógicos (Dados gerais / Conferência / Separação e volume / Automação / Status). `conferencia_cega` e `conferencia_checkout` ficam `disabledWhen: !realiza_conferencia`.
- **onSave**: quando `realiza_conferencia = false`, forçar `conferencia_checkout = false` e `conferencia_cega = false` antes de gravar.

---

### 2. `src/pages/RoteiroSeparacaoPage.tsx`

**2.1 — Badge do armazém ativo no cabeçalho**
- Consumir `armazemId` de `useTenant()`.
- Buscar `armazem.descricao` e exibir como badge `bg-primary/10` ao lado do título.

**2.2 — Prevenção de duplicatas nos agrupamentos**
- Modais de Agrupamento de Separação e de Conferência: filtrar `AGRUPAMENTO_SEP_OPTIONS` / `AGRUPAMENTO_CONF_OPTIONS` removendo tipos já existentes na respectiva lista.

**2.3 — Reformulação do contêiner "Ordem de Separação"**
- Novo estado `ruasDisponiveis: number[]` + `loadingRuas`.
- `fetchRuasArmazem`: consulta `endereco` com join `setor!inner(armazem_id)` filtrando pelo `armazemId` ativo; extrai ruas distintas ordenadas.
- `fetchOrdens`: adicionar filtro `or(armazem_id.eq.${armazemId},armazem_id.is.null)`.
- Card refatorado: subtítulo mostra nome do armazém; botão "Adicionar Rua" só aparece quando há ruas restantes; item da lista com drag-handle, número da sequência, "Rua N", `select` inline ASC/DESC (persiste no onChange) e botão de remover.
- Modal de ordem: substituir input numérico por `<select>` populado com ruas disponíveis (excluindo já usadas).
- `addOrdem`: incluir `armazem_id: armazemId` no insert.
- useEffect: incluir `fetchRuasArmazem` nas dependências junto com os fetchs existentes.

Preservado: `renderDragList`, handlers de drag-and-drop e estados existentes.

---

### Detalhes técnicos

- `useTenant()` já expõe `armazemId` (usado em outras páginas).
- Coluna `armazem_id` já existe em `ordem_expedicao` (backend confirmado no prompt).
- Sem migrations, sem edge functions, sem alterações em rotas.

### Riscos

- Baixo em `TiposSaidaPage`.
- Médio em `RoteiroSeparacaoPage`: verificar após implementação se `ordens` legadas (sem `armazem_id`) continuam aparecendo (o `or(...is.null)` cobre isso).
