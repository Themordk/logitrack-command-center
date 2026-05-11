## Objetivo

Habilitar duas novas integrações ERP Omie no CORE LogiTrack: **Grupo de Produto** (cadastros) e **Pedidos de Venda** (movimentos), expostas tanto no painel de sincronização quanto via importação manual nas telas de Grupos e Saídas.

## Arquivos a alterar (frontend apenas)

1. `src/pages/integracao/entidades.ts`
2. `src/components/erp/ImportarDoERPModal.tsx`
3. `src/pages/GruposProdutoPage.tsx`
4. `src/pages/SaidasPage.tsx` (apenas refinos no `camposPrevia`/aviso, fluxo já está wired)
5. `src/pages/integracao/SincronizacaoTab.tsx` (apenas se o reset de cursor precisar comportamento por-entidade)

Nenhuma migration, RLS, RPC ou Edge Function nova.

---

## Tarefa 1 — Painel Sincronização

Em `entidades.ts`:

- Em `cadastros`, trocar a entidade existente `grupo_produto` (hoje `fn: null`) para `fn: "sync-grupo-produto"`.
- Em `movimentos`, adicionar nova entidade `{ id: "pedidos_saida", label: "Pedidos de Venda", fn: "sync-pedidos-saida" }`.

Não tocar nas demais linhas. O `SincronizacaoTab` já consome `MODULOS` e habilita botões ▶/⏸/↺ automaticamente quando `fn` existe.

Reset de cursor: o handler atual zera `last_omie_id` **e** `last_omie_page` simultaneamente, o que cobre os dois casos pedidos pelo spec (page para grupo, id para pedidos). Manter como está; sem mudança.

Auto-criação de linha em `sync_config` já é feita pelo `upsertConfig` ao primeiro toggle de intervalo/ativo.

---

## Tarefa 2 — Importar Grupo de Produto (Dados Mestres > Grupos)

### `ImportarDoERPModal.tsx`

- Adicionar `"grupo_produto"` ao tipo `ImportEntidade`.
- Novo branch em `handleBuscar`:
  ```text
  body = { tenant_id, empresa_id, codigo_grupo: parseInt(valor) }
  invoke("sync-grupo-produto", { body })
  - se data.sucesso === true → setRegistro(data); setEstado("PREVIA")
  - se data.sucesso === false → throw new Error(data.erro || "Grupo não encontrado")
  - se error → throw error.message
  ```
- Detecção "já cadastrado": consultar `public.grupo_produto` por `codigo_erp = codigo` (ou usar flag retornada pela função se já vier como `data.ja_existia` / `data.atualizado`). Marcar `registro._jaExistia = true` quando aplicável e exibir badge **"Já cadastrado"** com botão **"Atualizar"** (ambos chamam `handleConfirmar`, que só dispara `onSuccess`).

### `GruposProdutoPage.tsx`

Trocar config do modal:

```ts
config={{
  titulo: "Importar Grupo de Produto do ERP",
  icone: <Tag size={28} />,
  labelCampo: "código do grupo no Omie",
  placeholderCampo: "Ex: 11209768439",
  tipoCampo: "number",
  entidade: "grupo_produto",
  camposPrevia: [
    { label: "Nome do Grupo", campo: "descricao" }, // mapear pelo nome real do retorno (nomeFamilia)
    { label: "Código ERP", campo: "codigo_erp" },
    { label: "Status", campo: "ativo" },
  ],
}}
```

Remover o uso anterior de `entidade: "redirect_sync"` e `mensagemRedirect`.

---

## Tarefa 3 — Importar Pedido de Venda (Atividades > Gerar Saída)

### `ImportarDoERPModal.tsx`

Reescrever o branch `pedido_saida` para o novo contrato da edge function:

```text
body = { tenant_id, empresa_id, numero_pedido: valor.trim() }
{ data, error } = invoke("sync-pedidos-saida", { body })

- se error → throw
- res = data?.results?.[0] || {}
- se res.pedidos_importados > 0:
    buscar documento em public.documento_saida
    select id, numero_pedido, parceiro_nome, data_previsao, valor_total, qtd_itens
    where empresa_id = empresaId AND numero_pedido = valor.trim()
    order by created_at desc limit 1
    setRegistro({ ...doc, _jaExistia: false }); setEstado("PREVIA")
- senão se res.ignorados > 0:
    mesma busca; setRegistro({ ...doc, _jaExistia: true }); setEstado("PREVIA")
- senão (res.erros > 0 ou nada):
    throw new Error(res.mensagem || "Pedido não encontrado no ERP")
```

A tela de PREVIA já existente renderiza `camposPrevia`; adicionar badge **"Já cadastrado"** quando `registro._jaExistia`. Botão de confirmação:
- novo → "Confirmar importação" (já importado pela edge; só fecha + `onSuccess` + navega)
- existente → "Ver documento"

Aviso na PREVIA já existe via `avisoConfirmacao`.

### `SaidasPage.tsx`

A config já está praticamente correta. Manter como está; se necessário, ajustar `placeholderCampo` para `"Ex: 35"` para alinhar ao spec. `verRegistroPath` já navega para `/atividades/saidas?documento_id=<id>`.

---

## Detalhes técnicos

- Continuar usando `supabase.functions.invoke(fn, { body })` (já injeta auth automaticamente).
- `tenantId` e `empresaId` vêm de `useTenant()` (padrão do projeto, não há `useAuth`).
- Busca pós-importação em `documento_saida` usa o client `supabase` direto, com filtro `.eq("empresa_id", empresaId).eq("numero_pedido", v).order("created_at", {ascending:false}).limit(1).maybeSingle()`.
- Para grupo "já existia": tentar `select id, descricao, codigo_erp, ativo from grupo_produto where empresa_id = empresaId and codigo_erp = String(codigo_grupo)` antes de chamar a função, ou após — o que for mais simples; preferir **antes**, para já marcar o badge sem depender do payload da edge.
- Reset visual de estado e tratamento de `BUSCA/BUSCANDO/PREVIA/IMPORTANDO/SUCESSO/ERRO` reaproveita o que já existe; nenhuma mudança estrutural no Dialog.
- Rotas, layout, cores, componentes de UI (`Dialog`, `Input`, `Button`, `toast`) permanecem inalterados.

## Fora do escopo

- Edge Functions (`sync-grupo-produto`, `sync-pedidos-saida`) — já existem e estão deployadas.
- RPCs novas, migrations, RLS.
- Mudanças em outras telas (Produtos, Parceiros, Entradas, Subgrupos, Rotas).
- Alterações no fluxo `nota_entrada` (já implementado em iteração anterior).
