# Ajustes na tela de Localizações / Endereços

## Contexto
A tela atual `/armazem/enderecos` lista endereços com colunas operacionais (M³, Peso Max, Pallets) e filtros básicos (Tipo, Situação, Lado, Curva, Status). A operação precisa de mais visibilidade sobre o agrupamento físico (armazém, setor, tipo de estoque) e estrutura.

## Objetivo
1. Adicionar filtros por **Setor**, **Armazém**, **Tipo de Estoque** e **Tipo de Estrutura**.
2. Remover do grid as colunas **M³**, **Peso Max** e **Pallets**.
3. Adicionar no grid as colunas **Tipo de Estoque**, **Armazém** e **Setor**.

## Escopo
Apenas a tela `src/pages/EnderecosPage.tsx` e uma nova view no banco para evitar N+1 e seguir o padrão *view-driven UI* do projeto.

## Plano de implementação

### 1. Banco de dados — view `vw_endereco_listagem`
Criar uma view no schema `public` que faz JOIN de `endereco` com `armazem`, `setor` e `tipo_estoque`, expondo os nomes legíveis junto aos IDs:

- Campos herdados de `endereco`: `id`, `tenant_id`, `armazem_id`, `setor_id`, `tipo_estoque_id`, `rua`, `predio`, `nivel`, `apto`, `descricao`, `tipo_endereco`, `lado`, `situacao`, `curva_acesso`, `ativo`, `tipo_estrutura`, `codigo_endereco`.
- Campos de apresentação: `armazem_descricao`, `setor_descricao`, `tipo_estoque_descricao`.
- Criar com `WITH (security_invoker = true)` para que a RLS/política de `tenant_id` da tabela `endereco` continue sendo aplicada pelo usuário autenticado.
- Conceder `SELECT` para `authenticated` e `service_role` (sempre incluir `service_role` para funções Edge / admin).

```sql
CREATE OR REPLACE VIEW public.vw_endereco_listagem AS
SELECT
  e.id,
  e.tenant_id,
  e.armazem_id,
  e.setor_id,
  e.tipo_estoque_id,
  e.rua,
  e.predio,
  e.nivel,
  e.apto,
  e.descricao,
  e.tipo_endereco,
  e.lado,
  e.situacao,
  e.curva_acesso,
  e.ativo,
  e.tipo_estrutura,
  e.codigo_endereco,
  a.descricao AS armazem_descricao,
  s.descricao AS setor_descricao,
  te.descricao AS tipo_estoque_descricao
FROM public.endereco e
JOIN public.armazem a ON a.id = e.armazem_id
JOIN public.setor s ON s.id = e.setor_id
JOIN public.tipo_estoque te ON te.id = e.tipo_estoque_id
WITH (security_invoker = true);

GRANT SELECT ON public.vw_endereco_listagem TO authenticated;
GRANT SELECT ON public.vw_endereco_listagem TO service_role;
```

### 2. Hook `useCrud` — suporte à view e busca textual
Ajustar `src/hooks/useCrud.ts` para:
- Quando `table === 'vw_endereco_listagem'`, incluir os campos `armazem_descricao`, `setor_descricao`, `tipo_estoque_descricao` e `codigo_endereco` na busca textual (`ilike`).
- Isso mantém o campo de busca global útil mesmo com a mudança de fonte de dados.

### 3. Tela `EnderecosPage.tsx` — filtros e grid

#### 3.1. Estado dos filtros
Adicionar estados `filterArmazem`, `filterSetor`, `filterTipoEstoque`, `filterTipoEstrutura` e compor `crudFilters`:
- `armazem_id` → `filterArmazem`
- `setor_id` → `filterSetor`
- `tipo_estoque_id` → `filterTipoEstoque`
- `tipo_estrutura` → `filterTipoEstrutura`

Regras de UX para selects dependentes:
- **Armazém**: opções filtradas por `empresa_id` do contexto (quando existir).
- **Tipo de Estoque**: opções filtradas por `empresa_id` do contexto (quando existir).
- **Setor**: opções filtradas por `armazem_id` selecionado no filtro; se nenhum armazém estiver selecionado, ficar vazio.
- **Tipo de Estrutura**: select fixo com valores do enum (`PORTA PALLET`, `BLOCADO`, `PRATELEIRA`, `FLOW RACK`, `DRIVE IN`, `MEZANINO`, `DOCA`).

#### 3.2. Chamada de dados
Alterar `useCrud` para:
```ts
const crud = useCrud({
  table: "vw_endereco_listagem",
  writeTable: "endereco",
  tenantId,
  orderBy: "descricao",
  filters: crudFilters,
});
```

#### 3.3. Grid
Atualizar o array `columns`:
- Remover: `m3`, `peso_total`, `total_pallet`.
- Adicionar:
  - `armazem_descricao` → "Armazém"
  - `setor_descricao` → "Setor"
  - `tipo_estoque_descricao` → "Tipo Estoque"
- Ordem sugerida: Endereço, Código, Tipo, Situação, Tipo Estoque, Armazém, Setor, Curva, Lado, Status.

#### 3.4. UI de filtros
Adicionar selects no `extraFilters` do `CrudTable`, logo após os filtros existentes, mantendo o mesmo estilo visual e o botão "Limpar filtros" já existente.

### 4. Testes e verificação
- Abrir `/armazem/enderecos` e confirmar que os novos filtros aparecem.
- Selecionar um armazém e verificar se o select de setor recarrega.
- Aplicar cada filtro e confirmar que a paginação server-side reflete a contagem correta.
- Verificar que as colunas removidas sumiram e as novas colunas exibem os nomes corretos.
- Confirmar que Novo/Editar/Excluir continuam funcionando (writeTable aponta para `endereco`).

### 5. Não está no escopo
- Nenhuma alteração no formulário de cadastro (modal) ou no cadastro em lote.
- Nenhuma alteração no banco além da view de listagem.
- Nenhuma alteração no módulo de etiquetas.