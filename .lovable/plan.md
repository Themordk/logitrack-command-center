# HU (Unidade de Manuseio) no Recebimento

Backend já pronto (tabelas `hu`/`hu_item` estendidas, RPCs `criar_hu_recebimento`, `buscar_hu_por_codigo`, `listar_itens_hu`, `desvincular_item_hu`). Apenas frontend.

## 1. Novo: `src/components/coletor/HUSelectorModal.tsx`

Bottom-sheet reutilizável com 2 abas (Scan / Criar).

- Props: `open`, `onClose`, `onSelect(huId, codigoHU, tipoHU, tamanho)`, `initialMode?: "scan" | "create"`, `movimentoEntradaId?: string | null`.
- Lê `core_tenant_id`, `core_empresa_id`, `core_armazem_id` de `localStorage` (padrão do coletor).
- Aba **Scan**: `ScanField` → RPC `buscar_hu_por_codigo` → card de confirmação (encontrada+disponível) ou erros (não encontrada / inativa) → `ActionButton success` "USAR ESTA HU".
- Aba **Criar**: selects Tipo (`PALLET/CAIXA/VOLUME/OUTRO`, default PALLET) e Tamanho (`P/M/G/GG/EG`, default M) → RPC `criar_hu_recebimento` → toast + `onSelect`.
- Dark theme HSL conforme prompt; ícones `lucide-react`; `(supabase as any).rpc(...)`.

## 2. Novo: `src/components/coletor/HUActiveBar.tsx`

Barra opcional acima do ScanField com 3 estados.

- Prop: `onHUChange(huId: string | null, codigoHU: string | null)`.
- Estado inicial lê `sessionStorage` (`coletor_hu_id`, `coletor_hu_codigo`).
- **Sem HU**: ícone `Archive` + texto + botões `Vincular HU` (abre modal em `scan`) e `Nova HU` (modal em `create`).
- **Com HU**: fundo verde translúcido, código mono + badge tipo/tamanho + `Trocar` + `✕` (desvincula).
- **Loading**: `Loader2` central.
- Ao selecionar/criar: grava sessionStorage e chama `onHUChange`.

## 3. Alterar: `src/pages/coletor/RecebimentoExecucaoPage.tsx`

Mudança cirúrgica:
- Importar `HUActiveBar`.
- State `huAtiva` inicializado do sessionStorage.
- Handler `handleHUChange` sincroniza state + sessionStorage.
- Renderizar `<HUActiveBar onHUChange={handleHUChange} />` dentro do `ColetorLayout`, imediatamente antes do `ScanField`.
- **Não** alterar `doConfirm` (já lê `coletor_hu_id` do sessionStorage).

## 4. Alterar: `src/pages/coletor/RecebimentoConferenciaPage.tsx`

Agrupar visualmente itens conferidos por HU:
- `reduce` em `items` por `codigo_hu || "__SEM_HU__"`.
- Renderizar cada grupo com header `Archive` + código (ou "Sem HU" cinza) + contagem, **apenas quando houver mais de um grupo** — caso contrário layout idêntico ao atual.
- Preservar o render existente de cada item.

## 5. Alterar: `src/pages/HUsPage.tsx`

- Adicionar colunas no grid: `status` (com map colorido ABERTA/FECHADA/EM_TRANSITO/ARMAZENADA/EXPEDIDA/DESCARTADA), `disponibilidade` (via `StatusBadge`), `peso_bruto`, `created_at` (data BR).
- Modal: campo `<select>` Status antes de Disponibilidade; incluir `status` nos defaults do novo, no load do edit, e no `baseData` do `handleSave` (default `ABERTA`).

## Regras

- Sem novas dependências. Sem edits em `components/ui/`. Sem `react-router-dom`.
- HU é 100% opcional — fluxo sem HU permanece funcional.
- `parseError` + `toast` (sonner) para erros; `(supabase as any).rpc(...)` nos RPCs novos.

## Verificação

- Abrir recebimento sem tocar na HU: fluxo funciona igual.
- Criar HU via barra → confirmar item → item aparece com `HU: HU-000000XXX` na lista.
- Trocar HU e continuar conferindo → `RecebimentoConferenciaPage` agrupa por HU.
- `/armazem/hus` mostra Status/Disponibilidade/Peso/Data e modal salva status.
