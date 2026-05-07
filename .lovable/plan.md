# Reformular `Configurações → Integração ERP` como painel do middleware Omie

Substituir totalmente o conteúdo da rota `/config/integracao` (arquivo `src/pages/IntegracaoPage.tsx`) por um painel de gestão do middleware de integração com o ERP **Omie**, lendo/gravando no schema `middleware` do Supabase. Nenhuma outra rota, componente global ou estilo será alterado. As tabelas legadas `integracao_config` e `integracao_objetos` permanecem intactas (apenas deixam de ser usadas nesta tela).

## Pré‑requisito (Supabase)

O schema `middleware` precisa estar exposto na API REST do Supabase para que `supabase.schema('middleware').from(...)` funcione no client. Vou validar isso na primeira execução:

- Se as queries retornarem erro `schema "middleware" is not exposed`, exibo aviso na tela e oriento o usuário a adicionar `middleware` em **Project Settings → API → Exposed schemas** no painel Supabase (ação manual fora do código).
- Não há migrations a aplicar — as tabelas já existem.

## Estrutura do arquivo

`src/pages/IntegracaoPage.tsx` será reescrito. Para manter o arquivo legível, criarei subcomponentes em `src/pages/integracao/`:

```text
src/pages/IntegracaoPage.tsx          (shell: header, StatusBar, Tabs)
src/pages/integracao/
  ├─ StatusBar.tsx                    (barra de status compacta)
  ├─ CredenciaisTab.tsx               (aba 1)
  ├─ SincronizacaoTab.tsx             (aba 2 — 3 seções de módulos)
  ├─ EntidadeRow.tsx                  (linha de uma entidade)
  ├─ LogsFilasTab.tsx                 (aba 3 — 2 painéis)
  ├─ LogsPanel.tsx                    (histórico sync_log)
  ├─ FilasPanel.tsx                   (sync_queue + return_queue)
  ├─ LogDetalheModal.tsx              (modal lateral de log)
  └─ entidades.ts                     (mapeamento entidade → label/edge function)
```

## `entidades.ts` — mapeamento central

```ts
export const MODULOS = [
  {
    key: 'cadastros',
    label: 'Cadastros',
    entidades: [
      { id: 'produtos',         label: 'Produtos',         fn: 'sync-produtos' },
      { id: 'parceiros',        label: 'Parceiros',        fn: 'sync-parceiros' },
      { id: 'grupo_produto',    label: 'Grupo de Produto', fn: null },
      { id: 'subgrupo_produto', label: 'Subgrupo de Produto', fn: null },
      { id: 'tipo_entrada',     label: 'Tipo de Entrada',  fn: null },
      { id: 'tipo_saida',       label: 'Tipo de Saída',    fn: null },
    ],
  },
  {
    key: 'movimentos',
    label: 'Movimentos',
    entidades: [
      { id: 'movimentos_entrada', label: 'Movimentos de Entrada', fn: 'sync-recebimentos' },
      { id: 'notas_entrada',      label: 'Notas de Entrada',      fn: 'sync-notas-entrada' },
      { id: 'movimentos_saida',   label: 'Movimentos de Saída',   fn: null },
    ],
  },
  {
    key: 'retorno',
    label: 'Retorno',
    entidades: [
      { id: 'retorno_entrada', label: 'Retorno de Entrada', fn: null },
      { id: 'retorno_saida',   label: 'Retorno de Saída',   fn: null },
    ],
  },
];

export const INTERVALOS = [1,5,10,15,30,60,360,720,1440]; // minutos
```

Entidades sem edge function exibem botão ▶ desabilitado com tooltip "Edge function ainda não disponível".

## Aba 1 — Credenciais (`CredenciaisTab.tsx`)

- Lê `middleware.omie_config` filtrando por `tenant_id` + `empresa_id` (`.maybeSingle()`).
- Campos: `app_key`, `app_secret` (password com toggle olho), `url_base` (default `https://app.omie.com.br/api/v1`, `readOnly`), `ativo` (Switch).
- Botão **Testar Conexão**: faz `fetch` POST para `${url_base}/geral/produtos/` com body `{ call:'ListarProdutos', app_key, app_secret, param:[{pagina:1, registros_por_pagina:1, apenas_importado_api:'N'}] }`. Mostra Badge verde "Conexão OK" ou vermelho com mensagem.
- Botão **Salvar**: upsert em `middleware.omie_config` (onConflict `tenant_id,empresa_id`). `app_secret` salvo apenas se preenchido.
- Reset/recarrega ao trocar `empresaId` / `empresaVersion` (padrão já usado na página atual).

## Aba 2 — Sincronização (`SincronizacaoTab.tsx`)

Para cada módulo (CADASTROS / MOVIMENTOS / RETORNO), renderiza um cabeçalho e uma tabela com as entidades do módulo.

Carregamento:
- `select * from middleware.sync_config where tenant_id=... and empresa_id=...`
- Para "Último lote" e status de erro, busca o `sync_log` mais recente de cada par (modulo, entidade) — uma única query agregada via `.in('entidade', […])` ordenada por `executed_at desc`, depois agrupada no client.
- Se não existir `sync_config` para uma entidade listada, exibo linha com defaults (interval 60, ativo=false) e crio o registro no primeiro update.

Polling: `setInterval(refetch, 30_000)` enquanto a aba estiver montada (cleanup no unmount).

Colunas/ações conforme spec:
- **STATUS**: `Executando` se existir log com `status='running'` nas últimas 5 min; senão `Erro` se último log = `error`; senão `Ativo`/`Pausado` por `ativo`.
- **INTERVALO**: `<select>` com opções de `INTERVALOS`; onChange faz `update sync_config set interval_minutes=...`.
- **ÚLT. EXEC**: `formatDistanceToNow(last_sync_at)` com `locale ptBR`. (Dependência `date-fns` já presente no projeto — confirmar; se não, usar formatador manual em pt-BR.)
- **PRÓX. EXEC**: `last_sync_at + interval_minutes` calculado no client.
- **ÚLT. LOTE**: `records_fetched ?? records_updated` do log mais recente.
- **▶ Executar**: `supabase.functions.invoke(fn, { body: { tenant_id, empresa_id } })`. Mostra toast de início e atualiza linha (status virtual "Executando" até próximo refetch).
- **⏸ Pausar/Ativar**: toggle `ativo` em `sync_config`.
- **↺ Resetar cursor**: confirm dialog → `update sync_config set last_omie_id=null, last_omie_page=null`.

## Aba 3 — Logs e Filas (`LogsFilasTab.tsx`)

Layout `grid grid-cols-1 lg:grid-cols-2 gap-4`.

### Painel esquerdo — `LogsPanel`
- Filtros: módulo, entidade (depende do módulo), status, período (date range — usar `<input type="date">` simples para evitar dependências novas).
- Query: `supabase.schema('middleware').from('sync_log').select('*', { count:'exact' }).range(from,to).order('executed_at',{ascending:false})` + filtros aplicados condicionalmente.
- Paginação 20/página com mesmo padrão usado em `EntradasPage` (footer com Prev/Next + total).
- Badges coloridos por status.
- Linha clicável → `LogDetalheModal` (Sheet do shadcn) com todos os campos e `error_message` formatado em `<pre>`.
- Botão **Exportar CSV**: gera CSV com os registros do filtro atual (sem paginação, limitado a 5000 linhas) usando `URL.createObjectURL`.

### Painel direito — `FilasPanel`
- Sub-tabs **Fila de Entrada** (`sync_queue`) / **Fila de Retorno** (`return_queue`).
- Card de resumo (4 contadores) acima da tabela: `select status, count(*)` agregado no client a partir da query atual (limit alto + agregação client) — ou queries separadas `count exact head:true` por status (mais barato; vou optar por essa).
- Tabela com colunas da spec + ações:
  - **🔁 Reprocessar**: `update ... set status='pending', retry_count=0, error_message=null where id=...`.
  - **🗑 Descartar**: `update ... set status='error', error_message='Descartado manualmente'`.
- Polling 15s.

## Barra de status global (`StatusBar.tsx`)

Renderizada no shell, entre o header e os `Tabs`:
- Ponto verde + "Integração Omie ATIVA" se `omie_config.ativo`, senão vermelho + "INATIVA".
- "Última sync: ..." → maior `last_sync_at` em `sync_config`.
- "X entidades ativas" → `count` de `sync_config where ativo=true`.
- "Y erros hoje" → `count` em `sync_log where status='error' and executed_at >= today` (Brasília).
- "Z reg. importados" → `sum(records_inserted + records_updated)` hoje (faço com `select records_inserted, records_updated where executed_at >= today` e somo no client; volume de logs/dia é baixo).

Polling 30s.

## Acesso ao schema middleware

Sempre via:
```ts
const mw = supabase.schema('middleware' as any);
mw.from('sync_config').select(...)
```
Como `Database` types não conhecem o schema `middleware`, uso `as any` localmente nas chamadas (mesmo padrão do projeto, que já usa `(supabase as any).from(...)`).

`tenant_id` e `empresa_id` vêm de `useTenant()` (`src/contexts/TenantContext`), conforme já usado na página atual.

## Detalhes visuais

- Manter `card-surface`, `bg-secondary/40`, `border-border`, badges `Badge` do shadcn (já no projeto). Cores semânticas:
  - Ativo / success / done → `bg-emerald-500/15 text-emerald-400 border-emerald-500/30`
  - Pausado / partial / processing → `bg-amber-500/15 text-amber-400 border-amber-500/30`
  - Erro → `bg-rose-500/15 text-rose-400 border-rose-500/30`
  - Executando / pending → `bg-sky-500/15 text-sky-400 border-sky-500/30` (com `animate-pulse` no executando)
- Reusar `Tabs`, `Select`, `Switch`, `Badge`, `Sheet`, `Table` do `src/components/ui/*`.

## Itens fora de escopo (não fazer)

- Não criar/alterar edge functions de `sync-*` (assume‑se que já existem; ▶ apenas dispara).
- Não tocar em outras rotas, no `TopNav`, breadcrumb ou roteamento.
- Não remover as tabelas `integracao_config` / `integracao_objetos`.
- Não implementar i18n nem novas dependências (sem instalar libs novas).

## Resumo de arquivos a alterar/criar

- ✏️ `src/pages/IntegracaoPage.tsx` (reescrita do shell)
- ➕ `src/pages/integracao/entidades.ts`
- ➕ `src/pages/integracao/StatusBar.tsx`
- ➕ `src/pages/integracao/CredenciaisTab.tsx`
- ➕ `src/pages/integracao/SincronizacaoTab.tsx`
- ➕ `src/pages/integracao/EntidadeRow.tsx`
- ➕ `src/pages/integracao/LogsFilasTab.tsx`
- ➕ `src/pages/integracao/LogsPanel.tsx`
- ➕ `src/pages/integracao/FilasPanel.tsx`
- ➕ `src/pages/integracao/LogDetalheModal.tsx`
