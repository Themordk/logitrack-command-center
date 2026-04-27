
# Revisão geral dos dropdowns do sistema

## Diagnóstico

Após as mudanças recentes (mover `tipo_estoque` para escopo de empresa, remover `setor` do escopo automático de armazém, isolamento por empresa no TopNav, etc.), vários dropdowns de cadastros administrativos ficaram vazios. As causas se enquadram em 4 padrões:

1. **Filtro por coluna inexistente** — `fetchOptions` é chamado com `armazem_id` em tabelas que só têm `empresa_id` (ou vice-versa), produzindo `0 linhas` sem erro visível.
2. **`fetchOptions` força `eq("ativo", true)`** em tabelas que não possuem coluna `ativo` — gera erro de coluna e o select volta `[]`.
3. **Falta de filtro por empresa em tabelas multi-empresa** — listagens dropdown vazam ou ficam vazias quando contexto muda.
4. **Falta de re-fetch ao trocar empresa no TopNav** — alguns `useEffect` não dependem de `empresaVersion`/`empresaId`.

### Mapa banco × código (problemas confirmados)

| Tabela | Tem `empresa_id` | Tem `armazem_id` | Tem `ativo` | Filtro usado hoje | Status |
|---|---|---|---|---|---|
| armazem | ✅ | ❌ | ✅ | `empresa_id` | OK |
| empresa | ❌ | ❌ | ✅ | nenhum | OK |
| perfil | ❌ | ❌ | ✅ | nenhum | OK |
| grupo_produto | ✅ | ❌ | ✅ | nenhum em ProdutosPage | **Falta filtro empresa** |
| subgrupo_produto | ✅ | ❌ | ✅ | nenhum em ProdutosPage | **Falta filtro empresa** |
| parceiro | ✅ | ❌ | ✅ | nenhum em ProdutosPage | **Falta filtro empresa** |
| tipo_estoque | ✅ | ✅ | ✅ | `empresa_id` | OK |
| setor | ❌ | ✅ | ✅ | `armazem_id` | OK |
| box | ❌ | ✅ | ✅ | `armazem_id` | OK |
| tipo_box | ❌ | ✅ | ✅ | `armazem_id` | OK |
| turnos | ❌ | ✅ | ✅ | `armazem_id` | OK |
| motivo_ocorrencia | ❌ | ✅ | ✅ | `armazem_id` | OK |
| rotas | ✅ | ✅ | ✅ | varia | **Inconsistente** (SaidasPage/ParceirosPage) |
| veiculos | ✅ | ❌ | ✅ | nenhum (SaidasPage) | **Falta filtro empresa** |
| zona_atividade | ❌ | ❌ | ❌ (sem coluna ativo) | n/a | **`fetchOptions` quebra** se chamado |
| picking_produto | ❌ | ✅ | ✅ | — | OK |

### Pontos específicos quebrados / fragilizados

1. **`UsuariosPage`** — `empresa` e `perfil` carregam OK, mas se usuário trocar de empresa no TopNav o `armazemOptions` só atualiza se houver `armazemId` do contexto novo (o `useEffect` já tem `empresaVersion`, OK). Verificar caso `armazemId` ficar nulo após troca.

2. **`ProdutosPage`** — `grupo_produto`, `subgrupo_produto` e `parceiro` são chamados sem filtro de `empresa_id`. Em ambiente multi-empresa, lista dados de outras empresas (vazamento) ou aparece vazio quando RLS filtrar (depende do contexto). Adicionar filtro `empresa_id` e dependência `empresaVersion`.

3. **`SaidasPage`** — `fetchOptions("veiculos", ...)` sem filtro: tabela tem `empresa_id`. Adicionar `{ empresa_id: empresaId }`. `rotas` filtra só por `armazem_id` mas deveria também filtrar por `empresa_id` (consistência com `ParceirosPage`).

4. **`ParceirosPage`** — só chama `fetchOptions("rotas")` quando `armazemId && empresaId` existem; OK, mas agora exige rotas com **ambos** preenchidos. Confirmado que rotas tem ambos no banco.

5. **`fetchOptions` (helper)** — força `.eq("ativo", true)` em todas as tabelas. Quebra silenciosamente em qualquer tabela sem coluna `ativo` (ex.: `zona_atividade`). Tornar a flag condicional: detectar se a tabela suporta `ativo` ou aceitar parâmetro `{ activeOnly?: boolean }`.

6. **`SetoresPage` listagem** — já corrigido em mensagem anterior (removido de `TABLES_WITH_ARMAZEM`), mas a aba de "Endereços > Cadastro em Lote" e seleção de setor no formulário precisam mostrar setores de TODOS os armazéns da empresa (visto que o usuário escolhe o armazém manualmente). Hoje filtra só pelo `armazemId` do contexto, escondendo setores quando o usuário trocar de armazém depois.

7. **Re-fetch em troca de empresa** — várias páginas dependem só de `[tenantId]` e não de `empresaVersion`. Lista: `ProdutosPage`, `SubgruposPage` (parcial — depende de `empresaId` mas não de `empresaVersion`).

## Correções propostas

### A. Helper `fetchOptions` (`src/hooks/useCrud.ts`)
- Adicionar 5º argumento opcional `options?: { activeOnly?: boolean; orderBy?: string }`.
- Default `activeOnly = true`, mas tornar `false` para tabelas sem coluna `ativo`.
- Manter assinatura retrocompatível.

### B. `ProdutosPage.tsx`
- Filtrar `grupo_produto`, `subgrupo_produto` e `parceiro` por `empresa_id`.
- Incluir `empresaId` e `empresaVersion` nas dependências do `useEffect`.

### C. `SaidasPage.tsx`
- `fetchOptions("veiculos", ...)` → adicionar `{ empresa_id: empresaId }`.
- `fetchOptions("rotas", ...)` → adicionar `empresa_id` ao filtro (manter `armazem_id`).
- Validar `empresaId` antes de abrir o modal.

### D. `ParceirosPage.tsx`
- Manter como está — funcional. Apenas garantir que mensagem clara aparece se `armazemId`/`empresaId` faltarem (rotas exige ambos).

### E. `EnderecosPage.tsx` e `EnderecosBatchPage.tsx`
- Já corrigidos em iterações anteriores. Sem alteração.

### F. `UsuariosPage.tsx`
- Sem alteração estrutural; adicionar comentário explicativo. (Já depende de `empresaVersion`.)

### G. `NovoInventarioPage.tsx`
- `zona_atividade` é consultado direto via `supabase.from("zona_atividade").select(...)` sem `.eq("ativo", ...)` — OK, não passa por `fetchOptions`. Sem alteração.

### H. Documentar padrão na memória
- Atualizar `mem://logic/master-data-logistics` ou criar nota curta com regra: "Sempre filtrar dropdowns pelo escopo correto da tabela (empresa_id vs armazem_id) e re-fetch em `empresaVersion`".

## Resumo dos arquivos a alterar

```
src/hooks/useCrud.ts          → fetchOptions: parâmetro activeOnly opcional
src/pages/ProdutosPage.tsx    → filtrar dropdowns por empresa_id + empresaVersion
src/pages/SaidasPage.tsx      → filtrar veiculos/rotas por empresa_id
mem://logic/dropdown-scoping  → nova nota de regra (ou append em existente)
```

Sem mudanças de banco, sem migrações, sem novas edge functions.

## Validação após implementação

1. Tela **Produtos** → modal mostra grupos/subgrupos/parceiros da empresa atual; troca de empresa atualiza listas.
2. Tela **Saídas** → botão "Gerar Onda" mostra Box/Rotas do armazém e Veículos da empresa.
3. Tela **Endereços** (novo + lote) → Setor (do armazém ativo) e Tipo de Estoque (da empresa ativa) populados.
4. Tela **Setores** → lista renderiza, campo Armazém no modal aparece preenchido.
5. Tela **Box / Tipo Box / Turnos / Motivos** → dropdowns dependentes de `armazem_id` populados.
6. Trocar empresa no TopNav refaz todas as consultas acima.
