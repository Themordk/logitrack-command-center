# Plano — Configurações de Armazém + ajuste `separacao_limpar_item`

## 1. UI — Configurações do Armazém

### 1.1 Acesso
Converter o modal `Editar Armazém` (em `src/pages/ArmazensPage.tsx`) num modal com **abas** (`Tabs` shadcn):
- **Dados gerais** — formulário atual (`CrudModal` reaproveitado via fields existentes).
- **Configurações** — só visível em modo edição (quando há `armazem_id`); oculto em "Novo Armazém".

Como o `CrudModal` genérico não suporta abas, criar um wrapper `ArmazemEditModal` específico que:
- Em "Novo": renderiza só o form de dados gerais (mantendo `CrudModal` ou replicando os campos).
- Em "Editar": renderiza `Tabs` com as duas abas acima. A aba "Configurações" monta `<ArmazemConfigForm armazemId={...} />`.

### 1.2 Componente `ArmazemConfigForm`
Local: `src/components/armazem/ArmazemConfigForm.tsx`.

Estado: carrega `armazem_config` por `armazem_id` (maybeSingle). Se não existir, formulário em branco; ao salvar, `upsert` com `onConflict: 'tenant_id,armazem_id'`.

Campos:
| Campo | Componente | Estado |
|---|---|---|
| `endereco_cancelamento_id` | `EnderecoSearchInput` (novo) | Ativo |
| `endereco_avaria_id` | `EnderecoSearchInput` disabled + badge "Em breve" | Desabilitado |
| `endereco_quarentena_id` | `EnderecoSearchInput` disabled + badge "Em breve" | Desabilitado |

Footer: botão **Salvar** (upsert) e **Remover configuração** (delete com `DeleteConfirmDialog`, só visível quando registro existe).

Toasts via `sonner` (`toast.success` / `toast.error`).

### 1.3 Componente `EnderecoSearchInput`
Local: `src/components/armazem/EnderecoSearchInput.tsx`.

Props: `value: string | null`, `onChange(id, codigo)`, `armazemId`, `tenantId`, `disabled?`, `placeholder?`.

Comportamento:
- Input de texto com debounce ~250 ms.
- Query Supabase:
  ```ts
  supabase.from('endereco')
    .select('id, codigo_endereco, descricao')
    .eq('armazem_id', armazemId)
    .eq('tenant_id', tenantId)
    .eq('ativo', true)
    .ilike('codigo_endereco', `%${termo}%`)
    .order('codigo_endereco')
    .limit(20)
  ```
- Dropdown estilo combobox (padrão dark já usado no projeto) com `codigo_endereco — descricao`.
- Ao selecionar: grava UUID em estado; exibe chip ao lado com `codigo_endereco` + botão `×` para limpar.
- Ao montar com `value` preenchido, fazer `select ... eq('id', value)` para hidratar o chip.
- Estados: loading, sem resultados, erro.

### 1.4 Persistência (upsert)
```ts
supabase.from('armazem_config').upsert({
  tenant_id, empresa_id, armazem_id,
  endereco_cancelamento_id,
  ativo: true,
  updated_by: usuarioId,
  created_by: usuarioId, // ignorado pelo PG no UPDATE
}, { onConflict: 'tenant_id,armazem_id' });
```

Delete: `supabase.from('armazem_config').delete().eq('armazem_id', armazemId).eq('tenant_id', tenantId)`.

## 2. Ajuste em `separacao_limpar_item`

Arquivo: `src/pages/MovimentoSaidaPage.tsx` (única chamada — linha 1213).

A chamada atual **não** envia `p_armazem_id` (já está correto nesse aspecto), porém **falta enviar `p_empresa_id`** que a nova assinatura espera. Atualizar para:

```ts
const { error } = await supabase.rpc("separacao_limpar_item" as any, {
  p_tenant_id: tenantId,
  p_empresa_id: empresaId,
  p_usuario_id: usuarioId,
  p_movimento_saida_id: limparSepItemDialog.movId,
  p_produto_id: limparSepItemDialog.produtoId,
});
```

Obter `empresaId` via `useTenant()` (já importado no arquivo? confirmar e adicionar se faltar).

Tratamento do erro novo (mantendo handler atual como fallback):

```ts
if (error) {
  if (error.message?.includes('Endereço de cancelamento não configurado')) {
    toast.error(
      'Endereço de cancelamento não configurado para este armazém. ' +
      'Acesse Armazém > Configurações para configurar antes de continuar.'
    );
    return;
  }
  throw error;
}
```

Conferir `separacao_conferencia_limpar_item` (linha 1254) — fora do escopo desta solicitação, **não alterar**.

## 3. Padrões / RLS
- Confiar em RLS — não filtrar manualmente `tenant_id` em SELECTs além dos exemplos acima (necessários para escopo de busca).
- Reaproveitar tokens semânticos (`bg-secondary/40`, `border-border`, `text-foreground`) — mesmo visual do `CrudModal`.
- Loading com `Loader2` (já padrão no projeto).
- Responsivo: form em `grid-cols-1` (mobile) / `md:grid-cols-2`.

## 4. Fora do escopo
- Avaria e Quarentena ficam apenas visíveis (disabled + badge).
- Nenhuma migração de banco (tabela já criada).
- Nenhuma alteração em outras chamadas RPC.

## Arquivos afetados
- **Novo:** `src/components/armazem/ArmazemConfigForm.tsx`
- **Novo:** `src/components/armazem/EnderecoSearchInput.tsx`
- **Novo/alterado:** `src/components/armazem/ArmazemEditModal.tsx` (wrapper com Tabs) — `ArmazensPage.tsx` passa a usá-lo no modo edição.
- **Alterado:** `src/pages/ArmazensPage.tsx` (troca do `CrudModal` no caminho de edição).
- **Alterado:** `src/pages/MovimentoSaidaPage.tsx` (adiciona `p_empresa_id` + handler de erro amigável).
