## Objetivo

Adicionar botão de **Atualizar lista** nas 6 telas de início de atividades do coletor, com cooldown de 3s para evitar spam de queries.

## Telas afetadas

| Rota | Arquivo | Função de carga |
|---|---|---|
| /coletor/separacao/iniciar | `src/pages/coletor/SeparacaoIniciarPage.tsx` | `loadOndas()` |
| /coletor/recebimento/iniciar | `src/pages/coletor/RecebimentoIniciarPage.tsx` | `loadMovimentos()` |
| /coletor/conferencia/iniciar | `src/pages/coletor/ConferenciaIniciarPage.tsx` | `loadOndas()` |
| /coletor/inventario | `src/pages/coletor/InventarioListPage.tsx` | `loadInventarios()` |
| /coletor/movimentos/abastecimento | `src/pages/coletor/AbastecimentoListPage.tsx` | `loadTarefas()` |
| /coletor/armazenagem | `src/pages/coletor/ArmazenagemDashboardPage.tsx` | `loadDashboard()` |

## UX proposta

Botão **flutuante circular** no canto superior direito da área de conteúdo do `ColetorLayout`, alinhado ao texto guia ("Selecione uma onda..."):

- Ícone `RefreshCw` (lucide-react), tamanho 36x36
- Posicionado **inline** ao lado do texto descritivo (não no header global, para não competir com o título e o botão Voltar)
- Estados visuais:
  - **Idle**: borda azul `hsl(217,91%,60%)`, ícone azul
  - **Loading**: ícone girando (`animate-spin`), desabilitado
  - **Cooldown** (3s pós-load): ícone cinza `hsl(213,31%,45%)`, desabilitado, com pequeno timer numérico (ex.: "3", "2", "1") no canto inferior direito do botão
- Toast discreto `toast.success("Lista atualizada")` quando completar (apenas em refresh manual, não no load inicial)
- Touch target ≥40px (compatível com tablets/coletores)

Justificativa do posicionamento: alinhado ao padrão tower-control do CORE LOGITRACK — ação contextual perto do conteúdo que afeta, sem poluir o header. Operador identifica imediatamente que o botão atua sobre a lista.

## Lógica de cooldown

Hook reutilizável `useRefreshCooldown(loadFn, cooldownMs = 3000)`:

```text
estado: 'idle' | 'loading' | 'cooldown'
- onClick: se 'idle' → chama loadFn → 'loading'
- ao terminar load → 'cooldown' com countdown (setInterval 1s)
- countdown chega a 0 → 'idle'
```

Retorna `{ refresh, state, secondsLeft }` consumido pelo botão.

## Componente novo

`src/components/coletor/RefreshListButton.tsx` — wrapper visual que consome o hook e renderiza o botão circular com os 3 estados.

`src/hooks/useRefreshCooldown.ts` — lógica de estado/timer.

## Mudanças por tela

Em cada uma das 4 páginas:
1. Importar `RefreshListButton` e passar a função de fetch existente
2. Inserir o botão no header da lista (linha do texto descritivo "Selecione...")
3. Sem alterar nenhuma lógica de negócio, fetch, ou navegação

## Fora de escopo

- Não alterar RPCs ou queries
- Não adicionar polling automático
- Não mexer em outras telas do coletor
