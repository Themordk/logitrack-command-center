## Objetivo
Refatorar o fluxo "Gerar Movimento" em `EntradasPage.tsx` para delegar a criação do movimento de entrada à função RPC `gerar_movimento_entrada`, ao invés de fazer múltiplos INSERT/UPDATE no client.

## Alterações

### `src/pages/EntradasPage.tsx` — função `handleGenerate`

Substituir toda a lógica atual (que faz 4 operações: insert em `movimento_entrada`, insert em `movimento_entrada_documento`, select+group em `documento_entrada_item` + insert em `movimento_entrada_item`, update em `documento_entrada`) por uma única chamada RPC:

```ts
const { data, error } = await (supabase as any).rpc('gerar_movimento_entrada', {
  p_tenant_id: tenantId,
  p_usuario_id: usuarioId,
  p_documento_entrada_ids: Array.from(selected),
  p_box_id: formData.box_id,
  p_armazem_id: formData.armazem_id || armazemId || null,
  p_placa_veiculo: formData.placa_veiculo || null,
  p_valor_descarga: formData.valor_descarga ? parseFloat(formData.valor_descarga) : null,
  p_confirma_volume: formData.confirma_volume,
  p_crossdocking: formData.crossdocking,
  p_observacao: formData.observacao || null,
});
if (error) throw error;
```

Comportamento pós-chamada preservado: toast de sucesso, fechar modal, limpar seleção e `fetchDocs()`. Tratamento de erro via catch existente.

Remover cálculo local de `totalVolume` (a função RPC cuida disso).

## Fora do escopo
- Nenhuma mudança em UI/campos do modal.
- Nenhuma mudança em outras telas.
