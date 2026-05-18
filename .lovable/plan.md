## Objetivo

Garantir que todas as rotas do módulo Coletor sejam totalmente operáveis em telas de até ~4" (320×568 e 360×640), evitando corte de informação crítica e rolagem desnecessária — sem mudar a identidade visual, rotas, ícones, cores semânticas ou a estrutura lógica das telas. A ideia é compactar onde dá (paddings, gaps, tamanhos auxiliares) e adotar o padrão "rodapé/CTA sticky + área central rolável" já validado em `ColetorHomePage`.

## Estratégia geral

1. **Centralizar a compactação em componentes compartilhados** para evitar tocar em cada uma das ~40 páginas. Toda a economia vertical "gratuita" virá daí.
2. **Padronizar o esqueleto de cada tela** em três zonas dentro de `ColetorLayout`:
   - topo fixo (info do produto / scan / dados do contexto) — `shrink-0`
   - área central rolável (lista, formulário extenso) — `flex-1 min-h-0 overflow-y-auto`
   - CTA inferior fixo (Confirmar, Avançar, Cancelar) — `shrink-0`, sem `fixed bottom-…` (eliminar o padrão de "botão flutuante + `pb-24`" onde existir).
3. **Tratar individualmente** apenas as poucas páginas longas em que o padrão acima precisa ser aplicado caso a caso (ver lista na seção "Páginas com ajuste pontual").
4. **Não alterar**: rotas, hash routing, ColetorLayout header (56 px), permissões, regras de negócio, fluxo de scan, tokens de cor do design system, lógica de feedback (`useFeedback`), comportamento do scanner (`readOnly` unlock).

## Mudanças nos componentes compartilhados (ganho global)

### `src/components/coletor/ColetorLayout.tsx`
- `<main>`: `p-4 gap-4` → `p-3 gap-3` (mantém `flex-1 overflow-y-auto min-h-0`).
- Sem mudar header, heartbeat, logout, indicadores ONLINE/OFFLINE.

### `src/components/coletor/ActionButton.tsx`
- Altura `h-[60px]` → `h-[52px]`; `text-lg` → `text-base`; `gap-2` mantido.
- Spinner `Loader2 size={22}` → `size={20}`.
- Mantém variantes, cores, `active:scale`, estado disabled — apenas reduz ~8 px por botão (×2-3 botões empilhados = ganho real em telas baixas).

### `src/components/coletor/ScanField.tsx`
- Padding `p-4` → `p-3`; ícone `ScanLine size={32}` → `size={26}`.
- Label `text-base` → `text-sm`; "Último/Aguardando" `text-sm` → `text-xs`.
- Mantém borda tracejada, foco automático, readOnly toggle e o input invisível por cima.

### `src/components/coletor/InfoCard.tsx`
- `p-3 space-y-2` → `p-2.5 space-y-1.5`.
- SKU `text-lg` → `text-base`; descrição `text-base` → `text-sm`.
- Linha de chips secundários `text-xs` → `text-[11px]`, `gap-x-4` → `gap-x-3`.

Esses 4 ajustes sozinhos liberam ~40-60 px de altura na maioria das telas operacionais, suficiente para a CTA caber sem scroll em 360×640 na grande maioria dos fluxos.

## Padrão a aplicar nas telas com lista + CTA

Hoje várias telas usam `flex flex-col gap-3 flex-1 pb-24` + `fixed bottom-6`. Esse padrão funciona, mas convive mal com teclado virtual e modal full-screen. Substituir por:

```
<ColetorLayout …>
  <div className="shrink-0 …"> {/* contexto/scan/info */} </div>
  <div className="flex-1 min-h-0 overflow-y-auto …"> {/* lista/itens */} </div>
  <div className="shrink-0 …"> {/* ActionButton(s) */} </div>
</ColetorLayout>
```

Isso elimina `fixed bottom-…` e o `pb-24` correspondente, e garante que o CTA seja sempre visível sem invadir conteúdo.

## Páginas com ajuste pontual

Para cada uma das páginas abaixo a mudança é apenas estrutural (zonas shrink-0 / flex-1 min-h-0 / shrink-0) e remoção do padrão "fixed bottom + pb-24" — sem mexer em lógica, dados, ícones, cores ou textos.

- `SeparacaoProdutoPage.tsx` — converter `fixed bottom-6` + `pb-24` para CTA `shrink-0` no rodapé; o card de produto vira a área superior `shrink-0`; restante ocupa `flex-1 min-h-0 overflow-y-auto`.
- `ConferenciaProdutoPage.tsx` — mesma conversão.
- `AbastecimentoColetaPage.tsx` — idem.
- `AbastecimentoDestinoPage.tsx` — idem.
- `RecebimentoExecucaoPage.tsx` — já usa `flex-1 min-h-0` na lista; padronizar para sempre ter CTA "VER RESUMO / FINALIZAR" em zona `shrink-0` (hoje aparece dentro do scroll quando `currentProduct` está ausente).
- `InventarioProdutoPage.tsx`, `InventarioEnderecoPage.tsx`, `InventarioListPage.tsx` — listas com filtros: filtros `shrink-0`, lista `flex-1 min-h-0`, botão de ação `shrink-0`.
- `AbastecimentoListPage.tsx`, `ConferenciaItensPage.tsx`, `ArmazenagemDashboardPage.tsx`, `RecebimentoVolumesPage.tsx` — mesmo padrão de lista + ação.
- `ConsultaProdutoPage.tsx`, `ConsultaEnderecoPage.tsx`, `ConsultaHUPage.tsx`, `ConsultaProdutoDetalhePage.tsx` — scan/header `shrink-0`, lista de resultados `flex-1 min-h-0 overflow-y-auto`.
- `ConfiguracoesPage.tsx` — agrupar opções dentro de área rolável; manter botões de salvar/logout fixos no rodapé.
- `RecebimentoConcluidoPage.tsx`, `ArmazenagemConcluidoPage.tsx`, `TransferenciaConcluidoPage.tsx` — ícone+mensagem central, dois botões finais em `shrink-0` (a redução do `ActionButton` para 52 px já resolve o overflow atual em 320×568).
- `ColetorLoginPage.tsx` — **já compactada em iteração anterior**, sem nova mudança.
- `ColetorHomePage.tsx` — **já compactada em iteração anterior**, sem nova mudança.

## Modais internos (Lote, Cancelar, EAN inválido, Resultado)

- Trocar `flex items-center` (ou `items-end`) por `items-center` + `max-h-[90vh] overflow-y-auto` no card interno, para que com teclado virtual o conteúdo role dentro do modal e o botão Confirmar continue acessível.
- `p-6` → `p-4`, `space-y-4` → `space-y-3`.
- Não trocar textos, ícones, variantes de ActionButton, nem comportamentos.

## Fora de escopo

- Header de `ColetorLayout` (mantém 56 px).
- Lógica de permissões (`PermissionsContext`), contagem de pendentes, ordem de prioridade de tarefas, regras de validação de EAN/endereço/HU.
- Rotas, hash routing, navegação programática.
- Telas administrativas (não-coletor) e `Layout` global.
- Tokens do design system, paleta de cores, ícones, textos.
- Edge functions e queries Supabase.

## Validação

Para cada rota do coletor, validar em:
- 320×568 (mínimo crítico) — toda informação essencial visível sem rolar até o CTA.
- 360×640 — sem scroll desnecessário; CTA sempre dentro da viewport.
- 390×844 / 414×896 — visual idêntico ao atual, sem sobras estranhas.

Checklist por tela:
1. CTA principal visível sem rolagem (com e sem teclado virtual aberto no Android coletor).
2. Lista interna rola sozinha, não arrasta header nem CTA.
3. Modais não cortam botões de Confirmar/Cancelar.
4. Nenhum texto/label essencial truncado de forma a perder significado (SKU, quantidade, endereço, lote).

