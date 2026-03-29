

# Alterações na Tela de Usuários

## Resumo

Ajustar a página de Usuários (`UsuariosPage.tsx`) e a edge function `create-usuario` para:
1. Remover email da UI (manter auto-gerado no backend)
2. Trocar "Tipo Usuário" por select de Perfil (tabela `perfil`)
3. Tornar Armazém e Turno opcionais
4. Na listagem, trocar coluna Email por Perfil vinculado

---

## Alterações

### 1. `src/pages/UsuariosPage.tsx`

**Estado e fetch:**
- Adicionar `perfilOptions` carregado via `fetchOptions("perfil", tenantId, "nome")`
- Remover campo `email` do array `fields`
- Alterar campo `tipo_usuario` para `perfil_id` com `type: "select"` usando `perfilOptions`, label "Perfil de Usuário"
- Tornar `armazem_id` e `turno_id` com `required: false`

**Colunas da tabela:**
- Remover `{ key: "email", label: "Email" }`
- Adicionar coluna com `render` customizado que exibe o nome do perfil vinculado
- Para isso, usar `useCrud` com `select: "*, usuario_perfil(perfil_id, perfil(nome))"` para trazer o perfil via join, ou carregar `usuario_perfil` separadamente

**Como obter o perfil na listagem:**
- Alterar o `select` do useCrud para `"*, usuario_perfil(perfil(nome))"` para join relacional
- Na coluna, renderizar `row.usuario_perfil?.[0]?.perfil?.nome ?? "—"`

**onSave (novo usuário):**
- Gerar email fictício a partir do login: `${login}@internal.logitrack`
- Enviar `perfil_id` no body da edge function em vez de `tipo_usuario`
- Remover `tipo_usuario` do payload

**onSave (edição):**
- Na edição, ao salvar, além do `crud.update`, atualizar `usuario_perfil`: deletar existente e inserir novo com `perfil_id` selecionado

### 2. `supabase/functions/create-usuario/index.ts`

- Receber `perfil_id` no body em vez de `tipo_usuario`
- Remover `armazem_id` da validação obrigatória
- Gerar email internamente se não recebido: `${login}@internal.logitrack`
- Usar `perfil_id` diretamente para inserir em `usuario_perfil` (em vez de mapear por nome)
- Continuar guardando `email` no campo da tabela `usuario` para o Auth funcionar

### 3. Sem alteração de schema

As tabelas `perfil`, `usuario_perfil` e `usuario` já existem com as colunas necessárias. Apenas o campo `email` e `armazem_id` na tabela `usuario` precisam permitir null (verificar se já permitem -- pela schema, `armazem_id` não é nullable na tabela `usuario`, mas é nullable em outras tabelas como `inventario`).

**Migration necessária:** Tornar `armazem_id` e `turno_id` nullable na tabela `usuario` (se ainda não forem), e tornar `email` não-required no frontend mas mantido no banco.

---

## Arquivos afetados

| Arquivo | Mudança |
|---------|---------|
| `src/pages/UsuariosPage.tsx` | Remover email da UI, trocar tipo_usuario por perfil_id select, tornar armazém/turno opcionais, coluna perfil na listagem |
| `supabase/functions/create-usuario/index.ts` | Receber perfil_id, gerar email auto, remover armazem_id obrigatório |
| Migration SQL | Tornar `usuario.armazem_id` e `usuario.turno_id` nullable (se necessário) |

