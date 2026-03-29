

# Plano: Padronizar Layout de Telas de Acompanhamento + Cores de Status

## Contexto

A tela **Ondas de Carregamento** (`MovimentoSaidaPage`) e a imagem de referencia mostram o layout padrao CORE: filtros inline no topo, split-view com lista a esquerda e detalhe a direita, sem cards de contadores.

A tela **Movimentos de Entrada** (`MovimentoEntradaPage`) tem layout diferente: cards de contadores de status, filtros em painel colapsavel, search bar duplicado, e estrutura diferente.

Alem disso, as cores de status sao inconsistentes entre telas e nao seguem a regra RED->GREEN.

---

## Parte 1: Padronizar Layout de Movimentos de Entrada

Alterar `MovimentoEntradaPage` para ter o mesmo layout de `MovimentoSaidaPage` (referencia):

### Remover
- Cards de contadores de status (grid com GERADO, EM CONFERENCIA, etc.)
- Painel de filtros colapsavel (card-surface com botao "Filtros")
- Search bar separado no painel esquerdo

### Substituir por
- Filtros inline no topo (mesma linha), no padrao da tela de Ondas:
  - Data De, Data Ate, Nº Movimento, Status (select), botao Filtrar
- Painel esquerdo `w-80` sem search bar extra, apenas a lista de movimentos
- Manter painel direito com tabs (Itens, Conferencia, Armazenagem, Informacoes) como esta

### Resultado visual esperado
Identico ao screenshot de referencia: titulo -> filtros inline -> split-view (lista | detalhe)

---

## Parte 2: Padronizar Cores de Status (RED -> GREEN)

Regra: o primeiro status do fluxo inicia com VERMELHO, o ultimo finaliza com VERDE, os intermediarios fazem gradiente entre eles.

### 2.1 MovimentoEntradaPage - STATUS_MAP

```
GERADO        -> vermelho  (bg-red-500/15 text-red-400 border-red-500/30)
LIBERADO      -> laranja   (bg-orange-500/15 text-orange-400 ...)
ERRO_TRANSPORTE -> amarelo (bg-yellow-500/15 text-yellow-400 ...)
EM_CONFERENCIA -> azul     (bg-blue-500/15 text-blue-400 ...)
CONFERIDO     -> ciano     (bg-cyan-500/15 text-cyan-400 ...)
DIVERGENCIA   -> amarelo   (bg-yellow-500/15 text-yellow-400 ...)
LIB_ARMAZENAGEM -> verde claro (bg-emerald-500/15 text-emerald-400 ...)
ARMAZENADO    -> verde     (bg-green-500/15 text-green-400 ...)
```

### 2.2 MovimentoSaidaPage - STATUS_MAP

```
CRIADA         -> vermelho
LIBERADO       -> laranja
EM_PICKING     -> amarelo
EM_CONFERENCIA -> azul
EM_CARREGAMENTO -> ciano
CONCLUIDA      -> verde
CANCELADA      -> cinza (caso especial, nao faz parte do fluxo)
```

### 2.3 InventarioPage - STATUS_MAP

```
CRIADO         -> vermelho
EM_CONTAGEM    -> laranja
EM_EXECUCAO    -> amarelo
EM_ANALISE     -> azul
EM_REVISAO     -> ciano
FINALIZADO     -> verde
CANCELADO      -> cinza
```

### 2.4 StatusBadge configs

Atualizar as cores em `StatusBadge.tsx` para seguir a mesma regra:
- `endereco-situacao`: Livre (verde) -> Ocupado (amarelo) -> Bloqueado (vermelho)
- `hu-disponibilidade`: Disponivel (verde) -> Reservada (amarelo) -> Bloqueada (vermelho) -> Em Movimento (azul) -> Descartada (cinza)
- `volume-status`: Aberto (vermelho) -> Fechado (laranja) -> Conferido (azul) -> Expedido (verde)
- `veiculo`: Disponivel (verde) -> Em Rota (amarelo) -> Manutencao (vermelho)

### 2.5 Coletor (getStatusColor)

Atualizar `ConferenciaItensPage` e `InventarioListPage` para usar a mesma logica de cores.

---

## Arquivos a modificar

| Arquivo | Mudanca |
|---------|---------|
| `src/pages/MovimentoEntradaPage.tsx` | Remover cards/filtros colapsaveis, usar filtros inline como MovimentoSaida |
| `src/pages/MovimentoEntradaPage.tsx` | Atualizar STATUS_MAP cores RED->GREEN |
| `src/pages/MovimentoSaidaPage.tsx` | Atualizar STATUS_MAP cores RED->GREEN |
| `src/pages/InventarioPage.tsx` | Atualizar STATUS_MAP cores RED->GREEN |
| `src/components/StatusBadge.tsx` | Atualizar cores dos configs |
| `src/pages/coletor/ConferenciaItensPage.tsx` | Atualizar getStatusColor |
| `src/pages/coletor/InventarioListPage.tsx` | Atualizar getStatusColor |
| `src/pages/coletor/AbastecimentoListPage.tsx` | Atualizar statusColor |

