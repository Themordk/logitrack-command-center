## Problema
Em `src/pages/PerfisAcessoPage.tsx`, o `fetchAll` busca `modulo` e `permissao` **sem filtro de tenant**:

```ts
(supabase as any).from("modulo").select("*").order("codigo"),
(supabase as any).from("permissao").select("*"),
```

Como a tabela `modulo` tem um registro por tenant (mesmo `codigo` repetido em cada tenant), a árvore de permissões mostra "Tipos de Tarefa" (e qualquer outro módulo cadastrado em múltiplos tenants) uma vez por tenant. Só apareceu agora porque o `web.config.tipos-tarefa` foi inserido em todos os tenants; os módulos antigos provavelmente já tinham esse mesmo problema latente.

## Correção
Ajustar apenas `PerfisAcessoPage.tsx` para escopar por tenant:

1. `modulo`: adicionar `.eq("tenant_id", tenantId)` no select.
2. `permissao`: filtrar por `modulo_id` dos módulos do tenant (dois passos — buscar módulos primeiro e depois `permissao.in("modulo_id", moduloIds)`), já que `permissao` não tem `tenant_id` direto na consulta atual.
3. Manter demais lógicas (grupos, busca, salvamento) intactas — os `permissao_id`s continuarão válidos pois pertencem ao próprio tenant.

Nenhuma mudança de schema ou dado — é bug puramente de UI/consulta.

## Verificação
Após o ajuste, "Tipos de Tarefa" e todos os demais módulos devem aparecer **uma única vez** na árvore de permissões, independentemente da quantidade de tenants na base.