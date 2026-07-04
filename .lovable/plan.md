## Objetivo
Atualizar a chamada `gerar_onda_separacao` em `SaidasPage.tsx` para a nova assinatura da função RPC.

## Alteração

### `src/pages/SaidasPage.tsx` — `handleGenerate` (linhas 123-131)

Adicionar `p_empresa_id` (já lido do contexto) e `p_usuario_id` à chamada, mantendo os demais parâmetros. Ordem/nomes conforme a nova assinatura:

```ts
const { data, error } = await (supabase as any).rpc("gerar_onda_separacao", {
  p_tenant_id: tenantId,
  p_empresa_id: empresaId,
  p_usuario_id: usuarioId,
  p_documentos: Array.from(selected),
  p_box_id: formData.box_id || null,
  p_rota_id: formData.rota_id || null,
  p_veiculo_id: formData.veiculo_id || null,
  p_prioridade: formData.prioridade || "NORMAL",
});
```

Garantir que `usuarioId` esteja disponível via `useTenant()` (já usado nas outras páginas — adicionar ao destructuring caso ainda não esteja).

Comportamento pós-chamada preservado (toast, fechar modal, limpar seleção, `fetchDocs()`).

## Fora do escopo
Nenhuma mudança em UI, campos do modal ou outras telas.