
# Correções V4 — Módulo de Etiquetas

Três correções independentes no módulo de etiquetas.

## 1. Alinhamento da última etiqueta em 2 colunas

**Arquivo:** `src/components/etiqueta/thermalEngine.ts` (função `getPrintCSSFromConfig`, bloco `duasColunas`).

- Adicionar `justify-content: flex-start` em `.etiqueta-row` para que a última etiqueta ímpar fique alinhada à esquerda (facilita corte da bobina).
- Adicionar `flex-shrink: 0` em `.etiqueta-row .etiqueta-thermal` para evitar encolhimento.
- Aplicar em ambos os CSS (print e não-print) se houver.

## 2. Múltiplos templates por tipo — `EtiquetaTemplatesPage.tsx`

O banco já suporta múltiplos (índice único apenas em `padrao=true`). Existe RPC `listar_etiqueta_templates(p_tipo, p_empresa_id)` retornando todos os templates ativos do tipo.

Alterações na tela `/armazem/etiquetas`:

- **Carregar lista completa** via RPC ao selecionar um tipo (ENDERECO/HU/PRODUTO/VOLUME), armazenando em `templates[]` e um `selectedTemplateId`.
- **Pré-seleção**: template com `padrao=true` (fallback: primeiro da lista).
- **Coluna esquerda**: renderizar lista de cards clicáveis abaixo dos botões de tipo, mostrando nome, dimensões e badge "PADRÃO" quando aplicável. Contador "Templates (N)" no cabeçalho.
- **Botão "Novo template"**: insere linha em `etiqueta_template` com defaults (100×40mm, horizontal, `padrao=false`), copia `campos` do primeiro template existente do tipo, recarrega lista e seleciona o novo.
- **Botão "Excluir template"**: visível apenas quando `draft.padrao === false`; usa `DeleteConfirmDialog`. Soft delete via `ativo=false` (padrão do projeto).
- **Switch "Marcar como padrão"**: ao ativar, primeiro faz `UPDATE padrao=false` em todos os templates do mesmo tenant/tipo/empresa, depois marca este como padrão. Recarrega.
- **Popular draft** ao trocar `selectedTemplateId` via `useEffect`.
- Erros via `parseError` + `toast.error`.

## 3. Seletor de template nos 4 modais de impressão

Arquivos:
- `src/components/etiqueta/PrintEtiquetaEnderecoModal.tsx` (tipo `ENDERECO`)
- `src/components/etiqueta/PrintEtiquetaHUModal.tsx` (tipo `HU`)
- `src/components/etiqueta/PrintEtiquetaProdutoModal.tsx` (tipo `PRODUTO`)
- `src/components/etiqueta/PrintEtiquetaVolumeModal.tsx` (tipo `VOLUME`)

Em cada um:

- **Carregar templates** via `listar_etiqueta_templates` ao abrir (`open === true`), filtrado por `empresaId` do `useTenant()`.
- **Substituir** o `<SelectField label="📐 Tamanho">` (presets fixos 100x40 / 50x20 / 80x20) por um `<select>` de templates listando `{nome} — {largura}×{altura}mm (Padrão)`.
- **Remover** o select separado de Orientação — passa a vir de `selectedConfig.orientacao`.
- **Pré-selecionar** o template `padrao=true` (fallback: primeiro).
- **Linha informativa** abaixo do seletor com dimensões em mm, "Paisagem/Retrato" e equivalente em px (×8).
- **Renderização**: `getTemplateFromConfig(selectedConfig)` quando existir; fallback para `getTemplateFromSelection("100x40","horizontal")` caso nenhum template esteja cadastrado (retrocompatibilidade).
- **Preview**: repassar `config={selectedConfig ?? undefined}` além de `tamanho`/`orientacao` derivados.
- **PrintEtiquetaEnderecoModal (específico)**: manter os controles locais adicionados na V3 (Seta Direcional, 2 Colunas, Intervalo). Adicionar `useEffect` que reinicializa esses controles a partir de `selectedConfig` ao trocar de template — usuário ainda pode sobrescrever manualmente por impressão.

## Regras gerais

- Não instalar dependências novas.
- Não editar `src/components/ui/`.
- Design system: `bg-card`, `text-foreground`, `border-border`, `bg-secondary`.
- `parseError` + `toast.error` para erros.
- RPC via `(supabase.rpc as any)("listar_etiqueta_templates", { p_tipo, p_empresa_id })`.
- Retrocompatibilidade: fallback para presets se lista vier vazia.

## Verificação (pós-build)

- Abrir `/armazem/etiquetas`: criar 2 templates de ENDERECO, alternar padrão, excluir o não-padrão.
- Abrir modal de impressão em Endereços/HU/Produtos/Volumes: template padrão vem pré-selecionado, orientação some do form, dimensões refletem template.
- Imprimir 3 etiquetas em 2 colunas: a 3ª fica alinhada à esquerda.
