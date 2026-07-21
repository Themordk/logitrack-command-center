# HU nas telas de Armazenagem, Consulta, Transferência e Abastecimento (Fase 2)

Extensão do suporte a HU (Unidade de Manuseio) do coletor. Backend e componentes (`HUSelectorModal`, `HUActiveBar`) da Fase 1 já existem. HU permanece 100% opcional — quando ausente, o fluxo é idêntico ao atual.

## 1. Armazenagem

**`ArmazenagemItensPage.tsx`** — após carregar itens, buscar em `tarefa_execucao` (join com `hu`) as HUs vinculadas às tarefas listadas (filtrando HU nula/zero UUID). Guardar em `huMap[tarefa_id]`. Renderizar badge `Archive` + código HU + tipo/tamanho abaixo do SKU. No `handleSelectItem`, gravar `coletor_armazenagem_hu` / `_hu_codigo` no sessionStorage (ou limpar).

**`ArmazenagemExecucaoPage.tsx`** — ler HU do sessionStorage e exibir badge "HU: XXX" dentro do card do produto. `handleConfirm` já envia `p_hu` para a RPC, sem alteração de lógica.

**`ArmazenagemIniciarPage.tsx`** — no `handleScan`, se código começa com `HU-`/`hu-`: chamar `buscar_hu_por_codigo` → `listar_itens_hu` → obter EAN do primeiro produto via `produto_embalagem` → chamar `fn_buscar_dados_armazenagem` com esse EAN e gravar HU no sessionStorage. Fluxo EAN puro inalterado. No `handleConfirm`, limpar `coletor_armazenagem_hu_codigo` se `coletor_armazenagem_hu` não estiver setada.

## 2. Consulta HU

**`ConsultaHUPage.tsx`** — incluir `status` no select do `hu`. Adicionar campo Status no card de detalhes. Após query de estoque, chamar RPC `listar_itens_hu` e guardar `huItensInfo`. Renderizar nova seção "Itens Agrupados (Conferência)" com SKU, descrição, quantidade, lote e validade (usando `formatDate`) — somente se houver itens.

## 3. Transferência

**`TransferenciaProdutoPage.tsx`** — `handleScan`: se código começa com `HU-`/`hu-`, buscar HU, validar disponível, consultar `estoque_geral` por `hu_id` + `endereco_id` (origem) com saldo > 0. Somar quantidades, pegar primeiro produto, gravar `transf_produto_*`, `transf_saldo_disponivel`, `transf_lote/validade/fabricacao`, `transf_hu_id`, `transf_hu_codigo`, navegar para `/detalhe`. Atualizar label do `ScanField` para "Escanear EAN do Produto ou HU".

**`TransferenciaDetalhePage.tsx`** — ler `transf_hu_codigo` e mostrar linha "HU: XXX" no card do produto quando presente.

**`TransferenciaDestinoPage.tsx`** — ler `transf_hu_id`/`transf_hu_codigo`, incluir `hu: huId || null` no insert de `tarefa_execucao`, exibir HU no resumo dos passos, e limpar as chaves do sessionStorage antes de navegar para concluído.

## 4. Abastecimento

**`AbastecimentoListPage.tsx`** — após carregar tarefas, consultar `estoque_geral` filtrando por `produto_id ∈ tarefas`, `endereco_id ∈ origens`, `hu_id != zero UUID`, saldo > 0. Montar `huMap[produto_id:endereco_origem_id]`. Renderizar badge com código HU na aba "coleta" após o saldo disponível. `handleSelectItem` grava `abast_hu_codigo` no sessionStorage (ou limpa).

**`AbastecimentoColetaPage.tsx`** — ler `abast_hu_codigo` e mostrar badge `Archive` + "HU: XXX" no card informativo.

## Regras técnicas

- Sem alterações de backend / RPCs.
- Sem `react-router-dom`; navegação por `onNavigate`.
- Coletor usa `localStorage` para tenant/empresa/armazém.
- `(supabase as any)` em RPCs e joins com relações novas.
- Ícones de `lucide-react` (`Archive`), toast via `sonner`.
- HU é opcional em todas as telas — ausência não altera comportamento existente.

## Verificação

- Item sem HU: telas continuam idênticas à versão atual.
- Bipar HU em Armazenagem/Iniciar carrega tarefa correspondente ao produto.
- Bipar HU em Transferência/Produto pré-carrega saldo agregado da HU no endereço origem.
- Transferência concluída grava `tarefa_execucao.hu` (trigger de estoque migra HU no destino).
- Consulta HU mostra Status e Itens Agrupados quando `hu_item` tem dados.
- Abastecimento exibe HU do estoque origem na lista e na coleta.
