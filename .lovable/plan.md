# Etiqueta HU Enriquecida com Dados Operacionais

## Escopo

Enriquecer a etiqueta de HU (100×70mm padrão) com dados do recebimento (fornecedor, NF, movimento, lote, validade, totais, peso) via RPC `dados_etiqueta_hu` já disponível no backend. Layout GS1-like em 4 zonas, com degradação para templates compactos (≤100×40mm). Sem migrations.

## 1) `src/components/etiqueta/EtiquetaHUPreview.tsx`

- **Expandir e exportar** interface `HULike` com campos opcionais: `peso_bruto`, `numero_movimento`, `data_entrada`, `parceiro_nome`, `numero_nota`, `lote_principal`, `validade_proxima`, `total_itens`, `total_quantidade`.
- **Aumentar default de altura**: `DEFAULT_H` de 320 → 560 (70mm × 8px/mm). Largura mantida.
- **`BarcodeHU`**: aceitar prop `barHeight`; altura dinâmica (70 quando houver dados de contexto, 120 quando não).
- **`EtiquetaHUSingle`**: novo layout em 4 zonas verticais com CSS inline (sem Tailwind):
  1. **Cabeçalho** (condicional `showHeader`) — logo/nome + label "HU" (mantém atual).
  2. **Contexto** (fornecedor + refs MOV/NF/ENTRADA) — só renderiza campos ativos no template E com valor; oculta zona inteira se nada visível.
  3. **Barcode + código legível** (SEMPRE presente).
  4. **Rodapé** — tipo/tamanho + lote + validade + qtd (SKUs·un) + peso, cada bloco só se ativo e com valor.
- **Modo compacto** (`isCompact = HPX <= 400`): esconder zona 2 (contexto) e reduzir rodapé para tipo+tamanho apenas, preservando compatibilidade com templates 100×40 existentes.
- **Filtragem por template**: usar `campos` do config já filtrados por `ativo` + `ordem` para decidir o que renderizar; fallback (sem config) mostra layout mínimo atual.
- Manter `escala_fonte` via `fs(n)` em todos os tamanhos. Mínimo 7px labels / 10px valores.

## 2) `src/components/etiqueta/PrintEtiquetaHUModal.tsx`

- Novo estado `husEnriquecidas: HULike[]` e `loadingDados: boolean`.
- Novo `useEffect` (dep `[open, hus]`): busca `tenant_id` do usuário logado e chama `(supabase as any).rpc("dados_etiqueta_hu", { p_tenant_id, p_hu_ids })`. Tratar unwrap de array aninhado (jsonb). Em erro, fallback para os dados básicos originais.
- Renderizar `<EtiquetaHUPreview hus={husEnriquecidas.length ? husEnriquecidas : hus} ...>` nos dois usos (print hidden div e preview visível).
- Bloco de loading atual passa a exibir "Carregando dados da HU..." quando `loadingDados`.
- Botão gerar/imprimir: `disabled={loading || loadingDados || !selectedConfig}`.

## 3) `src/pages/EtiquetaTemplatesPage.tsx`

Ampliar `DEFAULT_CAMPOS_BY_TIPO.HU` (linhas 50-53) com os novos campos disponíveis (ordem/ativo conforme prompt):

```
codigo_hu (on), tipo_hu (on), tamanho (on),
parceiro_nome (on), numero_movimento (on), numero_nota (on), data_entrada (on),
lote_principal (on), validade_proxima (on),
total_quantidade (off), total_itens (off), peso_bruto (off)
```

Não altera templates já persistidos — só afeta novos templates HU criados a partir daqui.

## Regras respeitadas

- CSS inline nas etiquetas (funciona em `window.open`).
- Sem migrations; RPC `dados_etiqueta_hu` já pronta.
- Sem alterar `etiqueta_template` no banco.
- Templates 100×40 existentes continuam renderizando (modo compacto).
- Campos vazios/0/null são ocultados (nunca "—").
- Barcode nunca é sacrificado.
- Cast `(supabase as any)` nas RPCs.

## Fora de escopo

- Alterações em outras etiquetas (Endereço, Produto, Volume).
- Migração automática de templates existentes para novo tamanho.
- Alterações no backend / RPCs.
