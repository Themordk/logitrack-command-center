## Objetivo

Reescrever `src/pages/RoteiroSeparacaoPage.tsx` seguindo o padrão visual das telas do sistema (semelhante a Zonas de Atividade): 3 cards de largura total com resumo inline e edição via Sheet lateral, substituindo os modais atuais.

## Layout da tela principal

- Header sem badge de armazém — apenas título e subtítulo.
- 3 cards empilhados verticalmente, largura total (remover `max-w-3xl` e layout em grid):
  1. **Agrupamento de Separação** — resumo `Tipo1 | Tipo2 | ...` na ordem de sequência.
  2. **Agrupamento de Conferência** — mesmo padrão.
  3. **Ordem de Separação** — resumo `Rua N (↑/↓) | ...`.
- Cada card com botão "Configurar" que abre a Sheet correspondente.
- Se vazio: texto "Nenhum agrupamento configurado" em muted.

## Estado

- Substituir todos os estados de modal (`showAgrupModal`, `agrupForm`, `showAgrupConfModal`, `agrupConfForm`, `showOrdemModal`, `ordemForm`) por:
  ```ts
  const [activeSheet, setActiveSheet] = useState<"separacao" | "conferencia" | "ordem" | null>(null);
  ```
- Remover `armazemNome` e o `useEffect` que busca o nome do armazém.
- Adicionar para a Sheet de Ordem:
  ```ts
  const [filtroArmazemId, setFiltroArmazemId] = useState<string>("");
  const [armazemOptions, setArmazemOptions] = useState<{value:string;label:string}[]>([]);
  ```

## Sheet unificada de Agrupamento (Separação / Conferência)

- Usar `Sheet` + `SheetContent side="right"` (shadcn) com `sm:max-w-[480px]`.
- Lista de checkboxes com TODAS as opções do enum:
  - Marcados no topo, ordenados por `sequencia`, com badge numérico e handle de drag (`GripVertical`).
  - Desmarcados embaixo, em ordem alfabética.
- Marcar checkbox → insert em `agrupamento_separacao`/`agrupamento_conferencia` com `sequencia = items.length + 1`.
- Desmarcar → chama `removeAgrupamento`/`removeAgrupConf` existentes.
- Drag-and-drop apenas entre marcados usa os handlers `handleDropAgrup`/`handleDropAgrupConf` já existentes.

## Sheet de Ordem de Separação

- Header + `Select` de armazém (populado por fetch de `armazem` da empresa ativa).
- Ao selecionar armazém: dispara `fetchRuasArmazem` (agora dependente de `filtroArmazemId`) e `fetchOrdens` filtrado por `filtroArmazemId`.
- Mesma UX de checkboxes das outras Sheets:
  - Ruas configuradas marcadas, com badge de sequência, `select` inline ASC/DESC e handle de drag.
  - Ruas não configuradas desmarcadas.
- `addOrdem(rua, ordem)` usa `filtroArmazemId` como `armazem_id` (não mais o do contexto).

## Fetches ajustados

- `fetchRuasArmazem`: depender de `filtroArmazemId` em vez de `armazemId` do contexto.
- `fetchOrdens`: filtro `or(armazem_id.eq.${filtroArmazemId},armazem_id.is.null)` quando `filtroArmazemId` presente.
- Novo `useEffect` para carregar `armazemOptions` a partir da tabela `armazem` (tenant/empresa ativos).

## Remover

- Os 3 `<Dialog>` antigos e o helper `renderDragList`.
- Classe `inputClass` (não usada fora dos modais).
- Estado `armazemNome` e useEffect associado.
- Layout `flex-col max-w-3xl` do container principal.

## Manter

- Constantes `AGRUPAMENTO_SEP_OPTIONS`, `AGRUPAMENTO_CONF_OPTIONS`, `ORDENACAO_OPTIONS`.
- Interfaces `AgrupamentoItem`, `OrdemItem`.
- Funções `fetchAgrupamentos`, `fetchAgrupConf`, `addAgrupamento`, `removeAgrupamento`, `addAgrupConf`, `removeAgrupConf`, `removeOrdem`, e handlers de drop.
- Uso das tabelas Supabase (`agrupamento_separacao`, `agrupamento_conferencia`, `ordem_expedicao`) inalteradas.

## Fora de escopo

- Sem novas dependências, sem novos arquivos, sem alterações em `App.tsx` ou `components/ui/`.
- Sem alterações de schema Supabase ou em outras páginas.

## Detalhes técnicos

- Imports novos: `Sheet, SheetContent, SheetHeader, SheetTitle` de `@/components/ui/sheet`, `Separator` de `@/components/ui/separator`, `Checkbox` de `@/components/ui/checkbox`, ícones `Settings2` (Lucide).
- Drag nativo HTML5 (`draggable`/`onDragStart`/`onDrop`) reaproveitado — nenhuma lib de DnD adicionada.
- Ao inserir via checkbox, disparar `fetch*` correspondente para reordenar visualmente.
