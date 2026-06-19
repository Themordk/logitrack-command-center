## Objetivo

Replicar nas demais páginas do menu **Atividades** o padrão de data-fetching já aplicado em `MovimentoEntradaPage.tsx` e `MovimentoSaidaPage.tsx`:

- `useQuery` (React Query) substituindo `useState + useEffect + fetchX`.
- `useDebounce` (400 ms) em todos os filtros de texto/numéricos digitáveis.
- Paginação **server-side** com `range()` + `count: "exact"` (ou via RPC quando já existir).
- `queryKey` incluindo todos os filtros + página, com `staleTime: 30_000` e `enabled: !!tenantId && !!empresaId`.
- `setPage(1)` em `useEffect` reagindo aos filtros debouncados.

**Sem alterações visuais, de layout ou de comportamento de UI.** Mesmas colunas, mesmos modais, mesmos botões, mesmos estados de loading/empty.

---

## Escopo — rotas do menu Atividades

| Rota | Arquivo | Estado atual | Ação |
|---|---|---|---|
| `/atividades/hus` | `src/pages/HUsPage.tsx` | `useCrud` (já server-side + debounce interno) | **Nada a fazer** — validar apenas |
| `/atividades/entradas` | `src/pages/EntradasPage.tsx` | `useState/useEffect`, `range()`, sem debounce, sem React Query | Migrar |
| `/atividades/saidas` | `src/pages/SaidasPage.tsx` | idem | Migrar |
| `/atividades/movimentos` | `src/pages/MovimentoEntradaPage.tsx` | Já migrado | — |
| `/atividades/abastecimento` | `src/pages/AbastecimentoPage.tsx` | `useState/useEffect`, **sem paginação** | Migrar + adicionar paginação server-side |
| `/atividades/mov-saida` | `src/pages/MovimentoSaidaPage.tsx` | Já migrado | — |
| `/atividades/volumes` | `src/pages/VolumesPage.tsx` | `useCrud` | **Nada a fazer** |
| `/atividades/embarque` | (não existe arquivo) | rota órfã no menu | Fora de escopo |
| `/atividades/inventario` | `src/pages/InventarioPage.tsx` | `useState/useEffect`, `range()`, sem debounce, sem React Query | Migrar |
| `/atividades/ocorrencias` | `src/pages/OcorrenciasOperacionaisPage.tsx` | idem | Migrar |

Total a refatorar: **5 arquivos** (`EntradasPage`, `SaidasPage`, `AbastecimentoPage`, `InventarioPage`, `OcorrenciasOperacionaisPage`).

---

## Padrão de refatoração (aplicado a cada página)

### 1. Imports
```ts
import { useQuery } from "@tanstack/react-query";
import { useDebounce } from "@/hooks/useDebounce";
```

### 2. Debounce de filtros de texto
Para cada `filterX` que é input de texto/numérico:
```ts
const debouncedX = useDebounce(filterX, 400);
```
Selects/datas continuam sem debounce (já são eventos discretos).

### 3. Reset de página
```ts
useEffect(() => { setPage(1); }, [debouncedX, ..., filterStatus, filterDateFrom, filterDateTo, tenantId, empresaId, armazemId]);
```

### 4. Query principal
```ts
const listQuery = useQuery({
  queryKey: ["<pagina>-list", tenantId, empresaId, armazemId, /* filtros debouncados + selects */, page],
  queryFn: async () => {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const q = (supabase as any).from("<tabela_ou_view>")
      .select("<cols>", { count: "exact" })
      .eq("tenant_id", tenantId)
      .eq("empresa_id", empresaId)
      // .ilike/.eq para cada filtro debouncado
      .order("<col>", { ascending: false })
      .range(from, to);
    const { data, error, count } = await q;
    if (error) throw error;
    return { rows: data || [], count: count || 0 };
  },
  enabled: !!tenantId && !!empresaId,
  staleTime: 30_000,
});

const rows = listQuery.data?.rows ?? [];
const total = listQuery.data?.count ?? 0;
const loading = listQuery.isLoading;
const totalPages = Math.ceil(total / pageSize);
```

### 5. Queries auxiliares (lookups)
Listas como `armazens`, `boxes`, `motivos`, `tiposTarefa` viram `useQuery` separados com `staleTime: 5 * 60_000`, mantendo a mesma forma de consumo.

### 6. Mutations / refresh manual
Botão "Atualizar" e callbacks pós-ação chamam `listQuery.refetch()` (e dependentes), substituindo as chamadas diretas a `fetchData()`.

---

## Detalhes por arquivo

### `EntradasPage.tsx`
- Filtros debouncados: nenhum input texto hoje; manter como está se não houver.
- Lookups (`box`, `armazem`) → `useQuery` com `staleTime` longo.
- Substituir `fetchData`/`useEffect` por `listQuery`.
- Após gerar movimento (`handleGerarMovimento`), chamar `listQuery.refetch()`.

### `SaidasPage.tsx`
- Mesmo tratamento; lookup de `armazem` em `useQuery`.
- Pós-RPC `gerar_movimento_saida` → `refetch()`.

### `AbastecimentoPage.tsx`
- **Adicionar paginação server-side** que hoje não existe (`page`, `pageSize=20`, `range`, `count: "exact"`), mantendo a mesma tabela visualmente (já é compacta — adicionar rodapé padrão idêntico ao de Inventário/Ocorrências).
- Lookup `armazens` em `useQuery`.
- Filtros de data continuam discretos (sem debounce).
- Pós-geração (`gerar_abastecimento`) → `refetch()`.

> Obs.: a adição do rodapé de paginação é necessária para suportar `range()`; segue o mesmo componente visual já presente em `InventarioPage` e `MovimentoEntradaPage`, então não introduz novo padrão de UI.

### `InventarioPage.tsx`
- Inputs texto (se houver `filterTexto`/busca) → debounce; selects sem debounce.
- `listQuery` + lookups (`tipos_inventario`, etc.) em `useQuery`.
- Pós-criação de inventário → `refetch()`.

### `OcorrenciasOperacionaisPage.tsx`
- Inputs texto (busca livre, se houver) → debounce.
- Filtros `filterStatus`, `filterEtapa`, `filterPrioridade` entram no `queryKey` sem debounce.
- Lookups (`motivos`, `usuarios`) → `useQuery`.
- Após ações de mudança de status/atribuição → `refetch()`.

---

## Não-escopo

- Nenhuma mudança em colunas, ordem, labels, estilos, modais ou comportamento de scroll/sticky.
- Não tocar em `MovimentoEntradaPage`, `MovimentoSaidaPage`, `HUsPage`, `VolumesPage`.
- Não criar página de Embarque (rota órfã — tratar em outra demanda).
- Não criar RPCs novas; usar `from().select(...{count:'exact'}).range(...)`. Caso uma RPC `listar_*` já exista para alguma tabela, usá-la (a confirmar por arquivo no momento da implementação).

---

## Validação

1. Build TypeScript limpo.
2. Em cada página: digitar nos filtros não dispara request a cada tecla (verificável via Network); 400 ms após parar, dispara um único request.
3. Paginação reseta para 1 ao mudar filtros.
4. Trocar empresa via switch global refaz todas as queries.
5. Visual idêntico ao atual (comparar lado a lado).
6. Ações (gerar movimento, gerar abastecimento, criar inventário, atualizar ocorrência) refletem na lista imediatamente via `refetch`.

---

## Riscos

- `AbastecimentoPage` ganha rodapé de paginação onde antes carregava tudo de uma vez. Comportamento muda apenas no sentido de **passar a paginar** — necessário confirmar se isso é aceitável (o pedido é "nenhuma mudança de comportamento da UI", mas sem paginação não há como aplicar server-side aqui). **Alternativa:** manter `pageSize: 1000` em uma única página para preservar o "carrega tudo", apenas envelopando em `useQuery`. Decisão padrão deste plano: **paginação real (20/página)**, igual às demais.
