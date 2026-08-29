# Quantidade de cópias na impressão de etiquetas

## O que muda para o usuário

**Painel administrativo** (modais de Produto, HU e Volume de Expedição):
- Na coluna direita, abaixo do seletor de Template, entra o campo "Cópias" com botões `−` / `+` e input numérico (mínimo 1, máximo 20, padrão 1).
- O botão de envio passa a refletir o total: "Enviar 3 etiquetas para fila" quando 1 item × 3 cópias, ou "Enviar 6 para fila" com 2 itens × 3 cópias.
- O botão "Reimprimir esta" também usa a quantidade informada.
- O valor volta a 1 sempre que o modal é reaberto.

**Coletor** (`/coletor/consulta/produto/detalhe`, aba Embalagens):
- O botão de impressora deixa de imprimir direto: abre uma folha inferior (bottom sheet) "Quantidade de cópias" com atalhos 1 / 2 / 5 / 10, campo numérico com `−` / `+`, e os botões "Cancelar" e "Imprimir N".
- Confirmando, a solicitação é enviada com o número de cópias escolhido; o feedback de sucesso/erro segue o padrão atual do hook.

O modal de Endereço não é alterado (não faz parte do pedido).

## Detalhes técnicos

- Novo estado `copias` (number, default 1) em:
  - `src/components/etiqueta/PrintEtiquetaProdutoModal.tsx`
  - `src/components/etiqueta/PrintEtiquetaHUModal.tsx`
  - `src/components/etiqueta/PrintEtiquetaVolumeModal.tsx`
  Reset para 1 no mesmo `useEffect` que reage a `open`.
- Nos 6 pontos de chamada (`handleEnviar` e `handleReimprimirAtual` de cada modal), trocar `p_quantidade_copias: 1` por `p_quantidade_copias: copias`. Nenhum outro parâmetro da RPC muda.
- Sanitização: `Math.min(20, Math.max(1, Math.floor(Number(v) || 1)))`.
- Coletor: em `src/pages/coletor/ConsultaProdutoDetalhePage.tsx`, o `onClick` do botão de impressora passa a guardar a embalagem selecionada em estado (`embParaImprimir`) e abrir o sheet; ao confirmar, chama `solicitar({ ..., quantidadeCopias: copias })` — o hook `useSolicitarImpressao` já aceita `quantidadeCopias` e o repassa como `p_quantidade_copias`, sem alteração no hook.
- Sheet do coletor implementado inline no arquivo, seguindo o padrão visual mobile já usado na página (fundo `hsl(222,35%,18%)`, botões grandes, sem teclado obrigatório).
- Sem migração de banco, sem edge functions, sem novas dependências.
