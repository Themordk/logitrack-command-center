## Refatoração da rota `/armazem/enderecos`

### 1º Ajuste — Container de filtros

Adicionar barra de filtros (via `extraFilters` do `CrudTable`, mesmo padrão já usado em `ProdutosPage`) com os seguintes seletores, todos com opção "Todos":

| Filtro | Campo | Tipo |
|---|---|---|
| Código | `codigo_endereco` | passa a entrar na busca textual (ilike) ao lado de `descricao` |
| Endereço (descrição) | `descricao` | busca textual já existente |
| Tipo | `tipo_endereco` | select: PULMAO, PICKING |
| Situação | `situacao` | select: LIVRE, OCUPADO, BLOQUEADO, **BLOQUEADO_INVENTARIO** |
| Lado | `lado` | select: PAR, IMPAR |
| Curva | `curva_acesso` | select: A, B, C, D |
| Status | `ativo` | select: Ativo / Inativo |

Comportamento:
- Estado local `filters` (`tipo_endereco`, `situacao`, `lado`, `curva_acesso`, `ativo`) repassado para `useCrud({ filters })`. Valor "all"/"" → não aplica `.eq`.
- Botão "Limpar filtros" reseta para "all".
- A busca por código entra junto com a busca por descrição: estender em `src/hooks/useCrud.ts` o bloco de `searchFields` adicionando `if (table === "endereco") searchFields.push("codigo_endereco");`.

### 2º Ajuste — Novo enum `BLOQUEADO_INVENTARIO`

O enum `enum_situacao_endereco` no banco hoje tem: `LIVRE`, `OCUPADO`, `BLOQUEADO`, **`BLOQUEADO_INVENTARIO`** (novo). Atualizar a UI:

1. **`src/components/StatusBadge.tsx`** — `endereco-situacao` hoje é indexado por número (0/1/2). Trocar para indexação por string para suportar os 4 valores:
   - `LIVRE` → verde "Livre"
   - `OCUPADO` → amarelo "Ocupado"
   - `BLOQUEADO` → vermelho "Bloqueado"
   - `BLOQUEADO_INVENTARIO` → roxo "Bloq. Inventário"

2. **`src/pages/EnderecosPage.tsx`** (lista) — remover o `map` numérico e passar `row.situacao` direto:
   ```tsx
   render: (row) => <StatusBadge status={row.situacao} type="endereco-situacao" />
   ```

3. **`src/pages/EnderecosPage.tsx`** (formulário Novo/Editar) — adicionar `"BLOQUEADO_INVENTARIO"` em `enumValues` do campo `situacao`.

4. **`src/pages/EnderecosBatchPage.tsx`** — se houver seleção de situação no cadastro em lote, incluir também `BLOQUEADO_INVENTARIO` (verificar e ajustar se necessário).

### Padrão visual preservado

- Mesmo layout do `CrudTable` (header → barra de filtros via `extraFilters` → tabela).
- Selects estilizados como nas demais telas (fundo `bg-secondary`, borda padrão).
- Nenhuma mudança em rotas, services, schema do banco ou triggers.
