## Ajustes no modal "Novo/Editar Picking" (Produtos)

Arquivo: `src/pages/ProdutosPage.tsx` (modal Picking nas linhas ~555–595).

### 1. Campo Endereço — busca por `codigo_endereco`
- Substituir o `<select>` nativo de Endereço pelo componente já existente `EnderecoSearchInput` (`src/components/armazem/EnderecoSearchInput.tsx`), que filtra `endereco` por `codigo_endereco` com debounce, escopo de `armazem_id` + `tenant_id` e `ativo = true`.
- Passar:
  - `value={pickForm.endereco_id}`
  - `onChange={(id) => setPickForm({ ...pickForm, endereco_id: id })}`
  - `armazemId={pickForm.armazem_id}`
  - `tenantId={tenantId}`
  - `disabled={!pickForm.armazem_id}`
  - `placeholder="Digite o código do endereço..."`
- Trocar o armazém limpa `endereco_id` (já feito hoje no `onChange` do select de Armazém — manter).
- Remover o `loadEnderecos` e o estado `enderecoOptions` se ficarem sem uso após a troca; manter caso outros pontos do arquivo dependam (verificar e limpar).

### 2. Campo Tipo Picking — rótulos capitalizados
Enum atual em `enum_tipo_picking`: `MASTER`, `FRACIONADO`, `PDV`.

Atualizar o array do select para exibir em title case mantendo os valores enviados ao banco:
```
{ value: "MASTER", label: "Master" }
{ value: "FRACIONADO", label: "Fracionado" }
{ value: "PDV", label: "PDV" }
```

Também atualizar a renderização do tipo na tabela de pickings (linha ~499) para exibir o mesmo label capitalizado, via um helper local `formatTipoPicking(v)`.

### Validação
- Salvar um novo picking selecionando endereço via busca por código.
- Editar um picking existente: o chip do endereço atual deve ser hidratado pelo `EnderecoSearchInput` (já tem efeito que busca pelo `id`).
- Confirmar que tabela e modal mostram "Master/Fracionado/PDV".
- Trocar armazém limpa o endereço selecionado.

### Fora de escopo
Sem alterações em banco, serviços ou demais telas.
