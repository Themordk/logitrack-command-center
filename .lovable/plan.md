## Objetivo

Em coletores com tela de até ~4" (320×568 / 360×640), a Home do Coletor (`src/pages/coletor/ColetorHomePage.tsx`) hoje empurra o rodapé (Consultas / Metas / Config) para fora da viewport, obrigando o operador a rolar para acessá-lo. O ajuste deve manter o rodapé **sempre visível e fixo** na parte inferior, com a rolagem ocorrendo **apenas no grid de módulos**.

## Diagnóstico

- `ColetorLayout` já usa `h-screen` + `flex-col` e o `<main>` interno é `flex-1 overflow-y-auto` — ou seja, a rolagem hoje acontece no `<main>` inteiro, levando junto o rodapé que está dentro do conteúdo (`mt-auto`).
- Na Home, a estrutura é: saudação + grid 2×N de módulos + rodapé com 3 botões. Com 6 módulos em 2 colunas (3 linhas) os cards ocupam mais que a altura disponível em telas baixas, e como tudo está dentro do mesmo container rolável, o rodapé desaparece embaixo do fold.

## Mudanças (apenas em `src/pages/coletor/ColetorHomePage.tsx`)

1. **Estrutura em 3 regiões dentro do `ColetorLayout`**:
   - Saudação ("Olá, {nome}") — `shrink-0`.
   - Área de módulos — `flex-1 min-h-0 overflow-y-auto` com o grid 2 colunas dentro. Essa é a **única** região rolável.
   - Rodapé (Consultas / Metas / Config) — `shrink-0`, sem `mt-auto` (não é mais necessário), com borda superior mantida.

2. **Compactação leve para caber melhor em 4"**:
   - Saudação: `mb-2` → `mb-1`, fonte `text-lg` → `text-base`.
   - Grid: `gap-3` → `gap-2`, padding interno dos cards `p-5` → `p-3`, ícones `size={32}` → `size={28}`, label `text-base` → `text-sm`.
   - Rodapé: reduzir `pt-4` → `pt-2`, ícones `size={24}` → `size={22}`, manter labels `text-[10px]`.
   - Loader (permLoading): manter centralizado dentro da área rolável.

3. **Comportamento esperado**:
   - Em telas pequenas: rodapé sempre visível; o grid de 6 módulos rola verticalmente se necessário.
   - Em telas maiores (≥ 640px): visual praticamente idêntico ao atual, sem aparecer scrollbar pois o conteúdo cabe.

## Fora de escopo

- `ColetorLayout` (não alterar — o comportamento `flex-1 overflow-y-auto` do `<main>` continua válido; quem assume a rolagem interna é a Home).
- Lógica de permissões, contagem de pendentes, navegação, ícones/cores de módulos.
- Outras páginas do coletor (cada menu interno como Recebimento/Consultas tem seu próprio layout e não apresenta o mesmo problema de rodapé).
- Tokens globais do design system.

## Validação

- Preview em 320×568 e 360×640: confirmar que o rodapé Consultas/Metas/Config fica colado embaixo e que o grid rola sozinho.
- Em 390×844: confirmar que não há scroll desnecessário e o layout segue agradável.
