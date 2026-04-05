

# Plano: Otimização de Consultas do Inventário

## Problema Identificado

Existem dois padrões N+1 graves nas telas de inventário:

### 1. InventarioPage.tsx (Listagem)
Para cada inventário retornado (até 20 por página), faz uma query individual para buscar `usuario.login` do `criado_por`. Com 20 registros = **21 requisições HTTP**.

### 2. InventarioExecucaoPage.tsx (Execuções da Contagem)
Para cada execução retornada (até 30 por página), faz **3 queries individuais**:
- `usuario.login` pelo `usuario_id`
- `endereco.descricao` pelo `endereco_origem_id`
- `hu.codigo_hu` pelo `hu`

Com 30 registros = **até 91 requisições HTTP**.

### 3. InventarioItensPage.tsx
Já usa a view `inventario_item_resumo` -- sem problemas.

### 4. NovoInventarioPage.tsx
Queries são disparadas por interação do usuário (busca, filtros). Sem N+1, mas pode consolidar carregamentos iniciais.

---

## Solução

Criar **2 views consolidadas** no banco para eliminar os padrões N+1, seguindo a arquitetura já usada no projeto (ex: `vw_movimento_entrada_lista`, `vw_lms_timeline_operador`).

### Migration SQL

**View 1: `vw_inventario_lista`**
- JOIN `inventario` com `usuario` (para `criado_por` -> `login`)
- Retorna todos os campos que a tela exibe
- Elimina as 20 sub-queries por página

**View 2: `vw_inventario_execucao`**
- JOIN `tarefa_execucao` com `usuario` (login), `endereco` (descricao), `hu` (codigo_hu)
- Retorna todos os campos que a tela de execuções exibe
- Elimina as 90 sub-queries por página

Ambas com RLS via `get_current_tenant()` embutido no filtro da view.

### Alterações no Frontend

**InventarioPage.tsx**: Trocar a query de `inventario` + Promise.all de enriquecimento por uma única query em `vw_inventario_lista`. Remover todo o bloco `enriched` (linhas 81-94).

**InventarioExecucaoPage.tsx**: Trocar a query de `tarefa_execucao` + Promise.all de enriquecimento por uma única query em `vw_inventario_execucao`. Remover todo o bloco `enriched` (linhas 51-95).

---

## Resultado Esperado

| Tela | Antes | Depois |
|---|---|---|
| Listagem Inventário | 21 requests | 1 request |
| Execuções Contagem | 91 requests | 1 request |

Todas as informações atualmente exibidas serão preservadas. Nenhuma alteração visual.

## Arquivos Afetados

- 1 migration SQL (2 views)
- `src/pages/InventarioPage.tsx` (simplificar fetch)
- `src/pages/InventarioExecucaoPage.tsx` (simplificar fetch)

