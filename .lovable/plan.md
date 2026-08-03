# Fase 2 — Refatoração dos modais de impressão (HU, Volume, Produto)

Replicar o padrão já aprovado do modal de Endereço nos três modais restantes, eliminando a impressão por navegador e passando tudo pela fila de impressão.

## O que muda para o usuário

- Os três modais (HU, Volume de Expedição, Produto) passam a ter o mesmo visual do modal de Endereço: preview térmico grande à esquerda (com zoom Ajustar/150%/200%), controles compactos à direita, cartão contextual do item exibido e rodapé polido.
- O preview passa a ser fiel à etiqueta real (renderização do ZPL do template), em vez do desenho HTML antigo.
- A impressão sempre vai para a fila da impressora térmica. Some o botão de imprimir pelo navegador.
- Quando há mais de uma etiqueta selecionada, aparece a navegação "Etiqueta N de M" com o botão "Reimprimir esta", que envia só a etiqueta atual sem fechar o modal.
- No modal de Produto, as caixas de seleção de campos opcionais (QR, marca, dimensões, pesos, M³, 2 colunas) deixam de existir: essas opções passam a ser definidas no template de etiqueta. Um aviso com link "Editar template" indica onde configurá-las.
- Avisos aparecem quando não há template cadastrado, quando o template está sem ZPL, ou quando o desenho ultrapassa a altura da etiqueta.

## Especificidades preservadas

- **HU**: continua buscando dados enriquecidos (parceiro, movimento, nota, lote, validade, quantidades, peso) pela função `dados_etiqueta_hu`; se falhar, usa os dados básicos recebidos. Botão de envio fica desabilitado enquanto templates ou dados carregam.
- **Volume**: sem busca extra; usa os dados já recebidos da listagem.
- **Produto**: sem busca extra; identificador de origem usa `produto_id`.

## Detalhes técnicos

Arquivos reescritos (espelhando `PrintEtiquetaEnderecoModal.tsx`):

- `src/components/etiqueta/PrintEtiquetaHUModal.tsx` — ícone `Package`, `p_tipo: "HU"`, `p_tipo_documento_origem: "hu"`, estados `husEnriquecidas`/`loadingDados` mantidos, lista = `husEnriquecidas.length ? husEnriquecidas : hus`.
- `src/components/etiqueta/PrintEtiquetaVolumeModal.tsx` — ícone `Boxes`, `p_tipo: "VOLUME"`, `p_tipo_documento_origem: "volume_expedicao"`, mantém apenas `import type { VolumeLike }`.
- `src/components/etiqueta/PrintEtiquetaProdutoModal.tsx` — ícone `Tag`, `p_tipo: "PRODUTO"`, `p_tipo_documento_origem: "produto_embalagem"`, `p_documento_origem_id = item.produto_id`.

Em todos: estados `templates / selectedConfig / loadingConfig / indicePreview / zoomLevel / overflowInfo / enviando`; `listar_etiqueta_templates` com o `p_tipo` correspondente; ZPL vindo de `corpo_zpl` com fallback `gerarZplTemplate`; `ZplPreview` com `onOverflow`; `handleEnviar` (toasts agregados: sucesso total fecha, parcial fecha com warning, falha total não fecha) e `handleReimprimirAtual` (toast individual, não fecha).

Removidos dos três modais: `window.print`, `window.open`, `printRef`, imports de `EtiquetaHUPreview`/`EtiquetaVolumePreview`/`EtiquetaProdutoPreview` (exceto o `type VolumeLike`/`EtiquetaProdutoItem`), `thermalEngine` (`getPrintCSS`, `getPrintCSSFromConfig`, `getTemplateFromConfig`, `validateLabel`), estado `opt`/`EtiquetaProdutoOptions`, helpers `SelectField`/`Check`, `validationErrors`, `saida`, `showPreview`, controles de 2 colunas/intervalo.

Marcação `@deprecated` (sem deletar) no topo de `EtiquetaHUPreview.tsx`, `EtiquetaVolumePreview.tsx`, `EtiquetaProdutoPreview.tsx`.

Páginas invocadoras:

- `HUsPage`, `VolumesPage`, `ProdutosPage` passam a aceitar `onNavigate?: (path: string) => void` e repassam ao modal.
- `App.tsx` passa `onNavigate={onNavigate}` nas rotas `/atividades/hus`, `/atividades/volumes`, `/dados-mestres/produtos`.
- Em `ProdutosPage` há duas chamadas: a da lista (linha ~915) recebe `onNavigate`; a outra está dentro do componente interno `ProdutoDetailModal`, que hoje não recebe `onNavigate`. Proposta: adicionar `onNavigate?` também a `ProdutoDetailModal` e repassar, para o link "Editar template" funcionar nos dois pontos. Se preferir manter o componente interno intocado, essa chamada fica sem `onNavigate` (link simplesmente não aparece).

Fora de escopo e intocados: `PrintEtiquetaEnderecoModal.tsx`, `ZplPreview.tsx`, `useLabelaryPreview.ts`, `detectarOverflowZpl.ts`, `zplGenerator.ts`, `thermalEngine.ts`, `useSolicitarImpressao.ts`, banco de dados, edge functions e componentes shadcn. Nenhuma dependência nova.
