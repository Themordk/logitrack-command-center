# Consulta de Produto no Coletor — Busca textual + Ações rápidas

Duas melhorias na rota `/coletor/consulta/produto`: buscar produto por texto (sem código de barras) e agir direto a partir do resultado (detalhes, mapear picking, transferir).

## Ação 1 — Busca textual de produtos

Nova página `/coletor/consulta/produto/busca`:
- Campo de texto com autofoco, ícone de lupa, botão de limpar, tema escuro do coletor.
- Busca dispara com no mínimo 3 caracteres e debounce de 300ms (abaixo disso, mensagem orientando).
- Consulta paralela em `produto` (sku/descricao/referencia via ilike, filtrado por tenant/empresa/ativo, limite 30) e em `produto_embalagem` por EAN (limite 10), com merge sem duplicatas e validação de tenant/empresa/ativo nos resultados por EAN.
- Resultados em cards: miniatura da imagem (48px), descrição, SKU e referência (quando houver).
- Estados: inicial, carregando, sem resultados, lista.
- Ao tocar num resultado: busca o EAN de menor fator do produto, grava em `sessionStorage` (`coletor_busca_ean`) e volta para `/coletor/consulta/produto`. Sem EAN cadastrado, exibe aviso e permanece na busca.

Na página de consulta:
- Botão azul com lupa ao lado do campo de scan, levando à nova rota.
- Ao montar, se existir `coletor_busca_ean`, consome a chave e executa o mesmo fluxo do scan (produto + saldos).

Rota registrada em `App.tsx` com import lazy, logo após `/coletor/consulta/produto`.

## Ação 2 — Ações rápidas no resultado da consulta

O botão único "Ver detalhes do produto" vira um grid de 3 botões (Detalhes, Mapear, Transferir), com ícones distintos e mesmo estilo escuro.

- **Mapear**: grava `mapear_from_consulta` (produtoId, nome, EAN) e navega para `/coletor/consulta/mapear-picking`.
- **Transferir**: grava `transf_from_consulta` e navega para `/coletor/movimentos/transferencia/origem`.

### Mapear Picking
- Lê `mapear_from_consulta` na montagem e pré-preenche o produto.
- Exibe card "Produto (da consulta)" no passo de scan de endereço.
- Após escanear o endereço, pula o passo de scan de produto e vai direto ao formulário quando o produto já é conhecido.

### Transferência
- `TransferenciaOrigemPage` lê `transf_from_consulta` (guardado em ref) e mostra o card do produto pré-selecionado.
- Após escanear a origem válida: localiza a embalagem pelo EAN, checa saldo em `estoque_geral` nesse endereço.
  - Com saldo: grava as chaves `transf_*` (produto, saldo, lote, validade, fabricação, fator, embalagem), limpa chaves de HU e navega direto para `/coletor/movimentos/transferencia/detalhe`, pulando o scan de produto.
  - Sem saldo: aviso "sem saldo neste endereço" e segue o fluxo normal para o scan de produto.
  - Em erro, cai no fluxo normal.

## Detalhes técnicos

- Arquivos alterados: novo `src/pages/coletor/ConsultaProdutoBuscaPage.tsx`; edições em `ConsultaProdutoPage.tsx`, `MapearPickingPage.tsx`, `TransferenciaOrigemPage.tsx` e `src/App.tsx`.
- Navegação apenas via `onNavigate` (hash routing), sem react-router; `sessionStorage` para transporte de estado; chamadas Supabase com `as any`.
- As chaves `transf_*` seguem exatamente o padrão já usado em `TransferenciaProdutoPage`, garantindo compatibilidade com as telas de detalhe/destino.
- Nada em `src/components/ui/` é tocado.
