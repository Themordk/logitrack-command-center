## Liberação de Armazenagem — fluxo unificado em duas etapas

Refatora o modal `LiberarArmazenagemModal` e ajusta o gate na página de Movimentos de Entrada para o novo fluxo inteligente, baseado no `status_item_movimento` de cada item e na RPC `liberar_armazenagem` v3 (com `p_item_ids`).

### 1. `src/pages/MovimentoEntradaPage.tsx`
- **Gate do menu (`openLiberarArmazenagem`)**: trocar a lista *allowed* por uma lista de *blocked* — habilitar para qualquer status **exceto** `GERADO`, `EXPORTADO`, `CANCELADO`, `ARMAZENADO`. Mensagens de toast permanecem.
- Dropdown já contém apenas uma entrada "Liberar armazenagem" (ícone `Package`) — nenhuma remoção necessária. Confirmar que não há mais a opção "c/ divergência" e manter assim.
- Nenhuma alteração em `handleMenuAction` ou nos demais fluxos.

### 2. `src/components/movimento-entrada/LiberarArmazenagemModal.tsx` (reescrita do conteúdo)
Manter a assinatura de props (`open`, `onClose`, `movimentoEntradaId`, `statusMovimento`, `onSuccess`) e o uso de `useTenant()`, `sonner`, `Dialog` shadcn, ícones Lucide. Estrutura interna nova:

**Estado interno**
- `step`: `"resumo" | "ocorrencias" | "vazio"`
- `itens`, `motivos`, `divergentesForm` (mesmo formato atual)
- `liberandoConferidos`, `submittingOcorrencias` (loadings separados)
- `etapa1Resultado` (mensagem retornada pela RPC quando há transição para Etapa 2)

**Fetch ao abrir (`useEffect`)**
- `movimento_entrada_item` filtrando `movimento_entrada_id` + `tenant_id`, join `produto:produto_id(sku, descricao)`.
- `motivo_ocorrencia` filtrando `tenant_id` + `ativo=true`, ordenado por `descricao` (sem `armazem_id`).
- Classificar:
  - `conferidos`: `status_item_movimento === "CONFERIDO"`
  - `divergentes`: `=== "DIVERGENTE"`
  - `pendentes`: em `["PENDENTE", "EM_ANDAMENTO"]`
  - Ignorar `ARMAZENADO` e demais.
- Definir `step` inicial:
  - `conferidos=0 && divergentes=0` → `"vazio"`
  - `conferidos>0` → `"resumo"`
  - `conferidos=0 && divergentes>0` → `"ocorrencias"` (vai direto)

**Estado `"vazio"`** — Estado 4 do spec
- Ícone `Clock` centralizado, título "Nenhum item conferido para liberação", subtexto "Aguarde a conferência dos itens para liberar a armazenagem", botão "Fechar".

**Estado `"resumo"`** — Estado 1
- 4 KPI cards: Total itens (neutro), Conferidos (verde), Divergentes (vermelho), Pendentes (cinza). Reaproveitar componente `KpiCard` existente.
- Se `conferidos.length > 0`: tabela com colunas SKU, Produto, Qtd Esperada, Qtd Conferida, Status (badge verde "Conferido").
- Se `divergentes.length > 0`: tabela com SKU, Produto, Esperada, Conferida, Diferença (vermelho), Status (badge vermelho "Divergente").
- Se `pendentes.length > 0`: banner amarelo "X item(ns) ainda pendente(s). Não serão liberados.".
- Footer:
  - Botão "Cancelar".
  - Botão primário "Liberar X item(ns) conferido(s)" → dispara **Etapa 1**.

**Etapa 1 — liberar CONFERIDOS**
```ts
const idsConferidos = conferidos.map(i => i.id);
const { data, error } = await supabase.rpc("liberar_armazenagem" as any, {
  p_movimento_entrada_id: movimentoEntradaId,
  p_tenant_id: tenantId,
  p_usuario_id: usuarioId,
  p_modo: "CONFERIDOS",
  p_itens_divergentes: [],   // array direto, sem JSON.stringify
  p_item_ids: idsConferidos,
});
```
- Tratar `data.sucesso === false` com `toast.error(data.mensagem)`.
- Em sucesso:
  - Se `divergentes.length > 0` → guardar `etapa1Resultado = data.mensagem`, trocar `step = "ocorrencias"` (modal continua aberto).
  - Senão → `toast.success(data.mensagem)`, `onSuccess?.()`, `onClose()`.

**Estado `"ocorrencias"`** — Estado 2 / 3
- Título: "Registrar ocorrências operacionais".
- Subtítulo:
  - Se veio de Etapa 1: "X item(ns) conferido(s) liberado(s). Registre as ocorrências dos itens abaixo para liberá-los."
  - Se entrada direta (sem conferidos): "Registre as ocorrências dos itens abaixo para liberá-los."
- Para cada item divergente, card vermelho contendo:
  - Header: SKU + descrição.
  - Badge "Falta: N un." (vermelho, `diff < 0`) ou "Sobra: N un." (amarelo, `diff > 0`).
  - Grid 3 colunas: Esperada | Conferida | Diferença (cor conforme sinal).
  - `<select>` obrigatório "Motivo da ocorrência *" populado por `motivos`.
  - `<textarea>` opcional "Observação".
- Footer:
  - Botão "Cancelar" → fecha; itens conferidos já foram liberados (a RPC é idempotente).
  - Botão primário "Registrar ocorrências e liberar" desabilitado enquanto algum divergente não tem `motivo_ocorrencia_id` → dispara **Etapa 2**.

**Etapa 2 — registrar ocorrências + liberar DIVERGENTES**
```ts
const idsDivergentes = divergentes.map(i => i.id);
const ocorrencias = divergentes.map(i => ({
  item_id: i.id,
  motivo_ocorrencia_id: divergentesForm[i.id].motivo_ocorrencia_id,
  observacao: divergentesForm[i.id]?.observacao || null,
}));

const { data, error } = await supabase.rpc("liberar_armazenagem" as any, {
  p_movimento_entrada_id: movimentoEntradaId,
  p_tenant_id: tenantId,
  p_usuario_id: usuarioId,
  p_modo: "CONFERIDOS",
  p_itens_divergentes: ocorrencias,  // array direto
  p_item_ids: idsDivergentes,
});
```
- Em sucesso: `toast.success(data.mensagem)`, `onSuccess?.()`, `onClose()`.
- Em falha: `toast.error`, manter modal aberto no `step` atual.

### 3. Verificações finais
- Garantir que `p_itens_divergentes` é passado como array JS (sem `JSON.stringify`) em ambas as chamadas — atualmente o código usa `JSON.stringify`, deve ser removido.
- Não tipar a RPC: continuar usando `supabase.rpc("liberar_armazenagem" as any, ...)`.
- Sem migrações, sem novas dependências, sem alterações em outras telas.
- Manter padrão visual dark-first do projeto (`text-foreground`, `text-muted-foreground`, `bg-secondary/40`, `border-border`, cores semânticas verde/vermelho/amarelo/azul/cinza).

### Arquivos alterados
- `src/pages/MovimentoEntradaPage.tsx` — apenas o gate em `openLiberarArmazenagem`.
- `src/components/movimento-entrada/LiberarArmazenagemModal.tsx` — refatoração interna mantendo a API de props.
