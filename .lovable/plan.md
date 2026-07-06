## Problema

Em `/dados-mestres/produtos`, ao cadastrar um novo Picking para o produto, o INSERT em `picking_produto` não envia `empresa_id`, causando falha/quebra de escopo (a tabela exige empresa_id).

## Correção

Arquivo único: `src/pages/ProdutosPage.tsx`, função `savePick` (~linha 232).

No ramo de INSERT (novo picking), incluir `empresa_id` derivado do `armazem_id` selecionado no formulário, garantindo coerência com o armazém (não apenas com o contexto).

### Alteração

Antes do insert, buscar a empresa vinculada ao armazém escolhido:

```ts
} else {
  // Resolve empresa_id a partir do armazém selecionado (garante coerência)
  const { data: arm, error: armErr } = await (supabase as any)
    .from("armazem")
    .select("empresa_id")
    .eq("id", pickForm.armazem_id)
    .maybeSingle();
  if (armErr || !arm?.empresa_id) {
    toast.error("Não foi possível resolver a empresa do armazém selecionado.");
    setPickSaving(false);
    return;
  }
  data.produto_id = produto.id;
  data.tenant_id = tenantId;
  data.empresa_id = arm.empresa_id;
  const { error } = await (supabase as any).from("picking_produto").insert(data);
  if (error) throw error;
}
```

Nenhuma outra rota/lógica é alterada. UPDATE permanece como está (não sobrescreve empresa_id).

## Fora do escopo
- Alterações em RLS, schema ou outras telas.
- Mudanças no fluxo de edição do picking.