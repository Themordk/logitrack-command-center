# Design system do CORE LogiTrack — regras de interface

> Definido pelo dono do produto em 26/11/2026. Vale para Lovable, Claude e pessoas.
> Não remova nem reescreva estas regras automaticamente, mesmo que parte do código antigo
> ainda não as siga: o código antigo migra aos poucos (ver "Código existente"). Mudanças só a pedido do dono.

## Objetivo

O LogiTrack deve parecer software profissional de operação logística, que uma empresa
reconhece como confiável — **não um sistema com "cara de IA"**. Isso vem de cinco princípios:

1. **Dado primeiro.** Números, status e listas são o conteúdo. Enfeite que não informa sai.
2. **Calmo.** A tela é quase toda neutra. Cor só tem três usos: status, ação principal e foco.
3. **Denso e alinhado.** Grade de 4px, colunas alinhadas, números tabulares à direita.
4. **Consistente.** A mesma coisa tem o mesmo componente em todas as telas.
5. **Direto.** Texto curto, em caixa de frase, sem exclamação e sem emoji.

## Proibido (é o que dá "cara de IA")

- Ícone dentro de quadrado/círculo colorido em cartões e KPIs.
- Barra de progresso decorativa, número inventado ou placeholder visível.
- Número ou cartão verde "porque está tudo bem". Verde não é a cor do normal.
- Gradiente, vidro (`backdrop-blur`), brilho, sombra colorida, `shadow-xl/2xl` em conteúdo.
- Cantos `rounded-xl/2xl/3xl`; tudo como cartão flutuante com sombra.
- `hover:scale`, animação de entrada em tudo, `animate-pulse/bounce/ping` decorativo.
- Emoji e símbolos (✓ ✕ ★ ⚠ 🔔) no lugar de ícone ou texto.
- RÓTULO EM CAIXA ALTA com espaçamento largo. Title Case ("Em Andamento").
- Texto de 10–11px (`text-[10px]`, `text-[11px]`).
- Selos arco-íris: amarelo **e** âmbar, vermelho **e** rosa, verde **e** esmeralda para a mesma ideia.
- Frases genéricas: "Bem-vindo de volta!", "Gerencie seus pedidos de forma eficiente", subtítulo que repete o título.
- Tela de dados centralizada com espaço vazio, "hero", ilustração.
- Ícone em todo botão e em todo título.
- Um estilo de título, botão ou cartão diferente por tela.

## Tokens (nunca use cor, tamanho ou sombra fora deles)

### Cores
| Uso | Classe | Nunca |
|---|---|---|
| Fundo da página / cartão / camada | `bg-background`, `bg-card`, `bg-surface-1..4`, `bg-muted` | `bg-[#0f1117]`, `bg-[hsl(...)]` |
| Texto principal / secundário | `text-foreground`, `text-muted-foreground` | `text-gray-400`, `text-slate-300` |
| Borda | `border-border` (padrão), `border-input` (campos) | `border-gray-700` |
| Ação principal, link, foco | `primary` (`bg-primary`, `text-primary`, `ring-ring`) | `bg-blue-500` |
| Status | `success`, `warning`, `danger`, `info`, `neutral` com opacidade: `bg-success/10 text-success border-success/25` | `green-400`, `emerald-400`, `amber-400`, `yellow-400`, `rose-400`, `red-500`… |
| Tipo de endereço | `zona-pulmao`, `zona-picking` | `purple-400`, `cyan-400` |
| Gráficos | `chart-1` … `chart-6`, nessa ordem | cores aleatórias por gráfico |

### Significado dos tons (um tom = um significado)
| Tom | Quando |
|---|---|
| `success` | terminou bem, disponível, meta cumprida **quando isso é a notícia** |
| `warning` | precisa de atenção logo: aguardando, reservado, perto do prazo, abaixo da meta |
| `danger` | impede a operação: bloqueado, erro, vencido, divergência, falha de integração |
| `info` | em andamento / em movimento (use pouco) |
| `neutral` | estado sem urgência: rascunho, criado, aberto, inativo, cancelado, etapa intermediária |

Exemplos: tarefa criada/atribuída = neutral, iniciada = info, concluída = success, cancelada = neutral ·
endereço livre = success, ocupado = neutral, bloqueado = danger, bloqueado por inventário = warning ·
prazo vencido = danger, em atenção = warning, normal = neutral (não verde) ·
integração com erro = danger, pendente = warning, enviada = success, não enviada = neutral.
Cor nunca é a única pista: o rótulo sempre diz o estado.

### Tipografia (fonte Inter; códigos em JetBrains Mono)
| Classe | Tamanho | Uso |
|---|---|---|
| `text-metric` | 28/32, 600 | número de KPI |
| `text-heading` | 20/28, 600 | título da tela (só no `PageHeader`) |
| `text-heading-sm` | 16/24, 600 | título de seção/cartão/diálogo |
| `text-body` | 14/20 | texto padrão, formulários |
| `text-body-sm` | 13/20 | tabelas, descrições |
| `text-caption` | 12/16 | metadados, selos, eixos. **Mínimo na web.** |

Pesos: 400, 500 (rótulos, botões) e 600 (títulos, números). Sem `font-bold/extrabold/black`
(exceto números do Painel de TV). Números sempre `tabular-nums`. SKU, endereço, HU, placa,
NF: `font-mono`. Caixa alta só no que é caixa alta por natureza (SKU, UF, placa).

### Espaço, cantos, elevação, movimento
- Grade de 4px: `gap-1/2/3/4/6`, `p-3/4/6`. Página `px-6 py-6`; entre seções `gap-6`; dentro de cartão `p-4`.
- Cantos: `rounded-md` em campos, botões e selos retangulares; `rounded-lg` em cartões, diálogos e popovers; `rounded-full` só em selo-pílula, avatar e ponto.
- Elevação: conteúdo da página tem **borda e nenhuma sombra**. Só o que flutua (menu, popover, diálogo, toast) usa `shadow-overlay`.
- Movimento: só cor/opacidade em 150ms (`transition-colors`). Sem zoom, sem quicar. Pulsar só no indicador "ao vivo".

### Ícones
Só `lucide-react`. Web `h-4 w-4`; coletor `h-5 w-5`. Herdam a cor do texto (`text-muted-foreground`
quando decorativos). Ícone só onde ajuda a reconhecer (Novo `Plus`, Exportar `Download`,
Atualizar `RefreshCw`, Filtrar `Filter`, menu `MoreHorizontal`). Nunca em fundo colorido.

## Componentes canônicos (use sempre estes)

| Para | Use | Onde |
|---|---|---|
| Título da tela + ações | `PageHeader` | `@/components/ds` |
| Bloco de conteúdo | `SectionCard` | `@/components/ds` |
| Grupo de cartões numa página (dashboards), com recolher | `PageSection` | `@/components/ds` |
| Indicador | `KpiCard` | `@/components/ds` |
| Status | `StatusPill` (ou um selo de domínio que use `StatusPill` por dentro) | `@/components/ds` |
| Lista vazia | `EmptyState` | `@/components/ds` |
| Botão | `Button` | `@/components/ui/button` |
| Cadastro (tabela + modal) | `CrudTable`, `CrudModal`, `DeleteConfirmDialog` | `@/components/crud` |
| Campos, diálogo, menu, abas, tooltip | primitivos shadcn | `@/components/ui` |
| Carregando | `Skeleton` no formato do conteúdo; `Loader2` só em botão/ação | `@/components/ui` |
| Notificação | `toast` do `sonner` | — |
| Coletor | `ColetorLayout`, `ScanField`, `ActionButton`, `StatusOverlay`, `StickyFooter`, `EtapaIndicador` | `@/components/coletor` |

Não crie um novo "card de KPI", "badge de status" ou "cabeçalho" local. Se o canônico não
atende, estenda o canônico (em `src/components/ds/`) e avise na entrega.
`KPICardPro` e as classes `badge-*` são legado: não use em código novo.

Referência pronta: a Torre de Controle (`src/pages/Dashboard.tsx` e `src/pages/dashboard/components/`)
foi a primeira tela migrada; copie a estrutura dela em dashboards e painéis.

## Estrutura de tela (web)

1. `PageHeader`: título curto · uma linha de contexto (armazém, período, atualização) · ações à direita, **uma** primária.
2. Barra de filtros: campos `h-9`, em linha, com "Limpar" em `ghost`; filtros aplicados visíveis.
3. KPIs (se houver): no máximo 4–6 por linha, grade alinhada, mesmo `KpiCard`.
4. Conteúdo: tabela ou `SectionCard`s. Largura total em telas de dados; formulários até `max-w-3xl`.

### Tabelas
Cabeçalho `text-caption font-medium text-muted-foreground` em caixa de frase, fixo ao rolar.
Linhas de 40px (`py-2 px-3`, `text-body-sm`), sem zebra, hover `bg-muted/50`. Texto à esquerda,
números à direita com `tabular-nums`, status com `StatusPill`. Ações da linha em `ghost` ou menu `MoreHorizontal`.
Paginação e totais vêm do servidor. Vazio = `EmptyState` dentro da tabela.

### Botões
- Hierarquia: `default` (primária, uma por área) · `outline` (secundária) · `ghost` (terciária e linhas de tabela) · `destructive` (irreversível, sempre com confirmação) · `link`.
- Tamanho web: `size="sm"` (36px) em barras e tabelas; padrão (40px) em formulários e rodapé de diálogo. Nunca `h-6/h-7`.
- Só ícone: `size="icon"` com `aria-label` e `Tooltip`.
- Rótulo = verbo + objeto, caixa de frase, até 3 palavras: "Liberar onda", "Exportar", "Salvar alterações". Nada de "OK", "Clique aqui".
- Use `Button`, não `<button>` cru com classes próprias.

### Formulários e diálogos
Rótulo acima do campo (`text-body-sm font-medium`), ajuda abaixo (`text-caption text-muted-foreground`),
erro abaixo em `text-danger` dizendo como corrigir. Campos `h-9`. Diálogo: título `text-heading-sm`,
corpo, rodapé com ações à direita (secundária, depois primária). Validação de regra vem do servidor (`errorMapper`).

### Gráficos (Recharts)
Use as props prontas de `@/components/ds` (`chartAxis`, `chartGrid`, `chartTooltip`, `chartColor(n)`, `toneColor`, `fmtNumero`).
Cores `chart-1…6` em ordem; grade `hsl(var(--border))`; eixos `12px` `text-muted-foreground`;
legenda só com 2+ séries; tooltip com números pt-BR. Barras ou linhas; pizza só com até 4 fatias.
Sem 3D, sem gradiente, sem animação longa.

## Coletor (operador, mão ocupada, luva, luz ruim)

- Texto mínimo 14px; dado principal 16–20px; quantidade e endereço grandes (`text-heading` ou maior) em `font-mono`.
- Botões ≥ 48px; ação principal 56px, na base (`StickyFooter`), uma só por etapa.
- Uma decisão por tela; etapas com `EtapaIndicador`; leitura com `ScanField` sempre focado.
- Feedback de toda ação crítica nos três canais: `StatusOverlay` + som + vibração (`useFeedback`).
- Cartão de lista: no máximo 3 linhas de informação; status com `StatusPill`.
- Sem tabelas, sem hover, sem texto de 12px, sem cinza claro sobre cinza.

## Painel de TV
Leitura a 3–5 m: números ≥ 48px, rótulos ≥ 20px, no máximo 6 indicadores por tela, alerta = cor **e** texto.

## Textos e formatos

- Português do Brasil, caixa de frase, sem exclamação, sem emoji, sem "Ops!".
- Erro: o que aconteceu + o que fazer ("Saldo mudou no endereço. Atualize a lista e confira o saldo.").
- Vazio: o que aparece aqui e quando ("As ondas aparecem quando o gestor libera a separação.").
- Mesmos termos em todo lugar: onda, carga, HU, endereço, pulmão, picking, conferência, separação.
- Números `toLocaleString("pt-BR")`; moeda "R$ 1.234,56"; percentual "97,2%"; data "26/11/2026"; hora "14:05"; fuso `America/Fortaleza` (helpers de `dateUtils`).

## Acessibilidade mínima
Contraste AA (os tokens já atendem nos dois temas), foco visível (`ring-ring`), alvo de toque
≥ 44px no coletor, `aria-label` em botão só de ícone, ícones decorativos com `aria-hidden`.

## Código existente

- A catraca `npm run design:check` mede cores de paleta, cores fixas, texto minúsculo, cantos
  exagerados, emoji, efeitos decorativos e `<h1>` soltos. **Nenhuma alteração pode aumentar
  esses números.** Se diminuírem, rode `npm run design:check -- --atualizar` para travar o ganho.
- Regra do escoteiro: ao mexer numa tela, migre para tokens e componentes o que você tocou nela.
  Não refatore telas que não fazem parte do pedido.

## Antes de entregar qualquer alteração de interface

1. Usei `PageHeader`, `SectionCard`, `KpiCard`, `StatusPill`, `EmptyState` e `Button` onde se aplicam?
2. Só tokens de cor, a escala tipográfica e `rounded-md/lg`? Nada da lista "Proibido"?
3. Uma única ação primária por área? Rótulos com verbo, em caixa de frase?
4. Estados de carregando (skeleton), vazio e erro existem e estão escritos?
5. Testei em 1440px e, se for coletor, em 360px? Números alinhados e `tabular-nums`?
6. `npm run design:check` passou?
