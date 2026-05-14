## Adicionar entidade "NFs de Devolução" na aba Sincronização

Adicionar uma nova linha na seção MOVIMENTOS da aba Sincronização (Configurações > Integração ERP), seguindo exatamente o padrão visual e técnico das entidades já existentes.

### Mudança única

**Arquivo:** `src/pages/integracao/entidades.ts`

Adicionar uma entrada no array `entidades` do módulo `movimentos`, posicionada após `pedidos_saida` (Pedidos de Venda):

```ts
{ id: "nf_saida", label: "NFs de Devolução", fn: "sync-nf-devolucoes" },
```

### Por que apenas essa mudança é suficiente

O componente `SincronizacaoTab.tsx` é totalmente data-driven a partir de `MODULOS`:

- A linha é renderizada automaticamente pelo `mod.entidades.map(...)`.
- Como `mod.key === "movimentos"`, os inputs **Data De** / **Data Até** já aparecem.
- Os botões **▶ Executar / ⏸ Pausar / ↺ Resetar** já chamam:
  - `supabase.functions.invoke("sync-nf-devolucoes", { body: { tenant_id, empresa_id, data_inicio, data_fim } })`
  - Toggle de `ativo` em `middleware.sync_config` via `upsertConfig`.
  - Reset de `last_omie_id` / `last_omie_page` em `middleware.sync_config`.
- O intervalo padrão de 1 min já existe em `INTERVALOS` e será gravado quando o usuário selecionar.
- A leitura/atualização de `sync_config` usa `mw = supabase.schema("middleware")`, conforme exigido.

### Fora do escopo (não alterar)

- Não modificar `SincronizacaoTab.tsx` — comportamento dos botões, toasts e payload já estão corretos.
- Não tocar em outras abas, seções ou entidades.
- Não criar/alterar Edge Functions ou migrações (já existem no backend).
- O toast detalhado com `dev_entradas` / `dev_saidas` não é exibido hoje para nenhuma outra entidade; manter o padrão atual ("execução iniciada") para preservar consistência visual e técnica, conforme regra 1 e 2.
