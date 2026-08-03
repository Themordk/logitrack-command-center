# Iteração 2 — Polimento visual do modal de impressão de etiqueta de endereço

Refinamento visual do modal já funcional da iteração 1, mais duas features: zoom no preview e reimpressão individual. Nenhuma alteração de backend, nenhuma dependência nova.

## O que muda para o usuário

1. O preview térmico vira o elemento principal do modal (coluna larga à esquerda), sobre uma "bancada" com padrão diagonal sutil e etiqueta com sombra — fundo da etiqueta sempre branco, mesmo no tema escuro.
2. Barra de zoom acima do preview com três níveis: Ajustar, 150%, 200%. A ampliação usa largura maior da imagem (não `transform: scale`), com scroll no container.
3. Card contextual abaixo do preview mostrando o endereço exibido no momento: código em fonte monoespaçada, setor, e badges de curva e tipo.
4. Botão "Reimprimir esta" ao lado da navegação de etiquetas (só quando há mais de um endereço selecionado). Envia apenas a etiqueta atual e mantém o modal aberto.
5. Aviso amarelo quando o ZPL do template desenha além da altura configurada, explicando por que o preview aparece cortado, com os valores em mm.
6. Cabeçalho com título e subtítulo condensado ("N etiquetas selecionadas · Template: X") — o badge azul de contagem sai da coluna lateral.
7. Rodapé em barra separada com borda superior e fundo suave, ocupando toda a largura do modal. Modal passa a `sm:max-w-4xl`.
8. O link "Editar template" passa a funcionar (a página de Endereços passa a navegação ao modal).

## Alterações técnicas

| Ação | Arquivo | Descrição |
|---|---|---|
| Criar | `src/lib/detectarOverflowZpl.ts` | Utility puro: regex sobre `^FO` e `^FT`, pega o maior Y em dots, soma margem de 40 dots, converte por `dpmm` (padrão 8) e compara com a altura do template. Retorna `{ overflow, yMaxMm, alturaMm, excessoMm }`; caso ZPL vazio ou altura inválida, retorna overflow falso. |
| Modificar | `src/components/etiqueta/ZplPreview.tsx` | Novos props `zoom?: 'fit' \| 1.5 \| 2` e `onOverflow?: (info: OverflowInfo \| null) => void`. `widthPx` derivado do zoom; container com `overflow: auto`; desk mat com padrão diagonal via `repeating-linear-gradient`; imagem com sombra fixa e fundo branco. `useEffect` chama `detectarOverflowZpl` quando `zpl`/`alturaMm` mudam e reporta pelo callback. Estados de loading/erro/vazio preservados. |
| Modificar | `src/components/etiqueta/PrintEtiquetaEnderecoModal.tsx` | Novos estados `zoomLevel` e `overflowInfo`; nova função `handleReimprimirAtual` (mesma RPC `solicitar_impressao`, item único, sem fechar o modal); grid passa a `md:grid-cols-[1fr_260px]`; header/rodapé redesenhados; toolbar de zoom, card contextual e callout de overflow adicionados; import de `MapPin`, remoção de `Layers`. Toda a lógica de templates, envio em lote e toasts permanece idêntica. |
| Modificar | `src/pages/EnderecosPage.tsx` | Adicionar `onNavigate={onNavigate}` na chamada do modal (linha 409-413). |

## Fora de escopo

Modais de HU, Volume e Produto; `thermalEngine.ts`; `zplGenerator.ts`; `useLabelaryPreview.ts`; `EtiquetaTemplatesPage.tsx`; rotas do coletor e relatórios; qualquer objeto no Supabase. `EtiquetaEnderecoPreview.tsx` continua existindo como deprecated. Nada de `window.print()` ou `window.open()`.
