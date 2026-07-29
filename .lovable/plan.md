## Problema

Na tela **Templates de Etiqueta** (`src/pages/EtiquetaTemplatesPage.tsx`), as duas abas (`TabsContent value="zpl"` e `value="termica"`) usam a classe `flex-1 flex flex-col`. O Radix esconde a aba inativa aplicando o atributo `hidden` (que equivale a `display: none`), mas a classe utilitária `flex` tem a mesma especificidade e vem depois na folha de estilo — então `display: flex` vence e **a aba inativa continua ocupando espaço**. Resultado: o bloco de código ZPL (com `min-h-[400px]`) permanece renderizado como área vazia e empurra o preview térmico para baixo do contêiner.

## Correção

Em `src/pages/EtiquetaTemplatesPage.tsx`, nos dois `TabsContent` (linhas ~796 e ~859):

- Trocar `className="flex-1 flex flex-col mt-0"` por `className="flex-1 mt-0 hidden data-[state=active]:flex data-[state=active]:flex-col"`.

Assim a aba inativa fica realmente oculta (`hidden`) e a ativa volta a usar o layout flex em coluna, mantendo o preview térmico no lugar correto, logo abaixo da barra de abas.

## Notas técnicas

- Nenhuma mudança de lógica, estado, dados ou banco.
- Nenhuma dependência nova; apenas ajuste de classes utilitárias Tailwind.
