## Objetivo
Integrar impressão automática de etiquetas nos fluxos do coletor via RPC `solicitar_impressao` (fire-and-forget, nunca bloqueando o operador).

## Arquivos a modificar

### NOVO
- **`src/hooks/useSolicitarImpressao.ts`** — Hook utilitário que encapsula a chamada RPC, lê `armazem_id` do localStorage, mostra toast de sucesso curto (2s) e loga silenciosamente falhas (sem impressora/template ou erro de rede).

### 1. `src/components/coletor/HUSelectorModal.tsx`
Após criação bem-sucedida da HU em `handleCreate`, disparar impressão tipo `HU` com `codigo_hu`, `tipo_hu`, `tamanho` retornados por `criar_hu_recebimento`. Origem `RECEBIMENTO_CRIAR_HU`, prioridade 3. Fire-and-forget antes de `onSelect`/`onClose`.

### 2. `src/pages/coletor/RecebimentoExecucaoPage.tsx`
Adicionar botão `Printer` (16px, azul primário) ao lado do nome do produto identificado. Ao clicar, dispara impressão tipo `PRODUTO` com `sku`, `descricao`, `ean`, `referencia`, `embalagem`. Origem `CONFERENCIA_ENTRADA`. Expandir `ProdutoInfo` com `embalagem` se necessário.

### 3. `src/pages/coletor/ConsultaProdutoDetalhePage.tsx`
Na aba Embalagens, adicionar botão `Printer` (14px) em cada embalagem, antes do botão excluir. Dispara impressão tipo `PRODUTO` com dados do produto + `embalagem` e `ean` da linha. Origem `CONSULTA_PRODUTO`.

### 4. `src/pages/coletor/SeparacaoProdutoPage.tsx`
Em `handleSalvarVolumes`, após sucesso e apenas se `geraVolumeEtapa === "SEPARAÇÃO"`: se `result.volumes[]` existir, imprimir uma etiqueta `VOLUME` por item (com `codigo_volume`, `numero_volume`, `total_volumes`); caso contrário, uma chamada genérica com `quantidadeCopias = qtd`. Origem `SEPARACAO`.

### 5. `src/pages/coletor/ConferenciaProdutoPage.tsx`
Mesma lógica da #4 dentro de `handleSalvarVolumes`, condicionada a `geraVolumeEtapa === "CONFERÊNCIA"`. Origem `CONFERENCIA_SAIDA`, movimentoId de `sessionStorage.coletor_conferencia_movimento_id`.

## Regras
- Sempre fire-and-forget; nunca `await` bloqueia navegação/onClose.
- Falha de impressão apenas loga no console (sem toast de erro).
- Sem novas dependências, sem alterações no banco/RPC.
- Estilo consistente: `bg-[hsl(217,91%,50%)]/10` + border/ícone azuis.
