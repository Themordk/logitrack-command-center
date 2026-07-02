## Objetivo

Criar novo fluxo **"Mudança de Picking"** no coletor (`/coletor/movimentos`), que transfere **todos os itens/lotes/saldos** de um endereço de picking origem para outro destino, em bloco.

Baseado no fluxo existente de Transferência entre Picking, mas trocando a etapa "produto único + quantidade" por "listagem de todos os produtos do endereço + botão CONFIRMAR MUDANÇA".

## Onde

**Novo menu** em `src/pages/coletor/MovimentosMenuPage.tsx` — item "Mudança de Picking" logo abaixo de "Transferência entre Picking" (ícone `Move` ou `Replace`, cor distinta).

**Novas páginas** em `src/pages/coletor/`:
- `MudancaPickingOrigemPage.tsx` — escanear endereço origem (idêntico ao `TransferenciaOrigemPage`, mas usa chaves `mudpick_*` no sessionStorage e navega para a listagem).
- `MudancaPickingListaPage.tsx` — lista todos os itens do endereço origem (produto, lote, validade, saldo) e botão "Confirmar Mudança".
- `MudancaPickingDestinoPage.tsx` — escanear endereço destino e executar a mudança em lote.
- `MudancaPickingConcluidoPage.tsx` — tela de sucesso, com resumo (endereço origem/destino, nº de itens transferidos, quantidade total).

**Rotas** em `src/App.tsx`:
- `/coletor/movimentos/mudanca-picking/origem`
- `/coletor/movimentos/mudanca-picking/lista`
- `/coletor/movimentos/mudanca-picking/destino`
- `/coletor/movimentos/mudanca-picking/concluido`

## Fluxo (4 passos)

1. **Origem** — scan do endereço, validação `situacao IN ('LIVRE','OCUPADO')`. Grava `mudpick_origem_id/desc`. Navega para lista.
2. **Lista** — busca em `estoque_geral` todos os registros com `endereco_id = origem` e `quantidade_disponivel > 0`, join com produto (sku, descrição). Exibe cards agrupados por SKU mostrando lote/validade/qtd. Se lista vazia → toast/erro "Endereço sem saldo". Botão "Confirmar Mudança" habilitado quando há itens.
3. **Destino** — scan do endereço, validações: existir, situação válida, `id != origem`, ser do tipo picking (recomendado). Ao confirmar, executa a mudança.
4. **Concluído** — mostra resumo e botões "Nova Mudança" / "Voltar ao Menu".

## Execução da mudança (etapa Destino)

Para **cada registro** de `estoque_geral` retornado na origem:

1. Cria uma `tarefa` (tipo TRANSFERÊNCIA — mesmo `TIPO_TAREFA_TRANF = 6942b989-816c-45c5-8af5-50cd22589cc6` já usado na transferência), status `CONCLUIDA`, `id_local_origem/destino`, `quantidade_requerida = quantidade_disponivel`.
2. Cria uma `tarefa_execucao` com `quantidade_executada`, `endereco_origem_id`, `endereco_destino_id`, `lote`, `validade`, `fabricacao`, `iniciado_em/concluido_em = nowBrasilia()`.

O trigger `trg_tarefa_execucao_estoque` (memória: gestão de estoque exclusivamente via trigger de banco) atualiza `estoque_geral` automaticamente — o frontend **não** manipula saldos.

Processar em loop `for..of` para preservar 1 tarefa por combinação produto/lote/validade e garantir rastreabilidade. Se qualquer insert falhar, exibir erro no `StatusOverlay` e interromper (transferências parciais ficam registradas via trigger — aceitável, mesmo comportamento do fluxo atual).

Contadores exibidos na tela final: `itens_transferidos` (nº de linhas de estoque) e `quantidade_total` (soma).

## Detalhes visuais

- Mesmo `ColetorLayout`, cores e componentes (`ScanField`, `ActionButton`, `StatusOverlay`) usados em Transferência.
- Menu com ícone `Replace` (lucide-react) em cor `hsl(280,80%,60%)` para diferenciar de Transferência.
- Cards da lista: sku em `text-[hsl(217,91%,60%)]`, badge de lote em `bg-[hsl(222,35%,16%)]`, quantidade destacada.
- Passo "X de 3" no header de cada tela.

## Fora do escopo

- Sem migrações de banco (utiliza trigger e tipo de tarefa existentes).
- Sem alterações nos fluxos de Transferência unitária ou Abastecimento.
- Sem novas RPCs — tudo via inserts diretos, como o fluxo atual.
