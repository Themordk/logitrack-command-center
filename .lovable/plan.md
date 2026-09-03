# Botão "Filtrar lista" nas telas de Separação e Conferência

Adicionar um botão de filtro ao lado do botão de atualizar (refresh) nas telas de seleção de onda do coletor, com filtros persistentes durante a sessão.

## Telas afetadas

- `/coletor/separacao/iniciar`
- `/coletor/conferencia/iniciar`

## Comportamento

1. **Botão de filtro**: mesmo tamanho e estilo do botão de refresh (círculo 40x40, borda azul), posicionado imediatamente à esquerda dele, com espaçamento suficiente para evitar clique acidental.
2. **Estado ativo**: quando houver ao menos um filtro preenchido, o botão muda de cor (âmbar/amarelo) e exibe um contador com a quantidade de filtros ativos.
3. **Caixa de filtros**: ao tocar no botão abre um painel (bottom sheet no padrão escuro do coletor) com três campos:
   - Tipo de saída (lista de opções derivada das ondas carregadas + opção "Todos")
   - Número do movimento de saída (número da onda)
   - Número do documento de saída (pedido)
   Ações: "Limpar filtros" e "Aplicar".
4. **Filtragem**: aplicada na lista já carregada (sem mudança no backend). Número do movimento e documento aceitam correspondência parcial; tipo de saída é correspondência exata.
5. **Persistência**: filtros salvos em `sessionStorage`, separados por tela. Continuam válidos ao navegar para outros menus e voltar; são descartados ao encerrar a sessão/logout.
6. **Lista vazia por filtro**: mensagem específica ("Nenhuma onda corresponde aos filtros") com atalho para limpar filtros, diferente da mensagem de "nenhuma onda liberada".

## Detalhes técnicos

Todos os campos necessários já vêm das RPCs `separacao_buscar_ondas` e `conferencia_buscar_ondas` (`numero_onda`, `pedidos`, `tipo_venda`), portanto nenhum ajuste de banco ou RPC é necessário.

Novos arquivos:
- `src/components/coletor/FilterListButton.tsx` — botão circular espelhando o estilo de `RefreshListButton`, com props `activeCount` e `onClick`.
- `src/components/coletor/FiltroOndasSheet.tsx` — painel de filtros (overlay + card inferior), campos controlados, botões Limpar/Aplicar.
- `src/hooks/useOndasFilter.ts` — estado dos filtros com leitura/escrita em `sessionStorage` (chave por tela, ex.: `coletor_filtro_ondas_separacao`), retorna `filters`, `setFilters`, `clear`, `activeCount` e uma função `apply(lista)`.

Arquivos alterados (somente UI/apresentação):
- `src/pages/coletor/SeparacaoIniciarPage.tsx`
- `src/pages/coletor/ConferenciaIniciarPage.tsx`

Em cada página: usar o hook, renderizar `FilterListButton` + `RefreshListButton` no mesmo grupo do cabeçalho, filtrar `ondas` antes do `map`, limpar a seleção atual caso a onda selecionada saia do resultado filtrado, e adicionar o estado vazio específico de filtro. Nenhuma alteração em lógica de negócio, RPC, rotas ou componentes de `components/ui/`.
