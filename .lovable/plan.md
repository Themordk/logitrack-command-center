## Configurações → Impressão (Agents, Impressoras, Fila) + RBAC

Página `/config/impressao` sob o grupo Configurações no `TopNav`, com 3 abas (`Tabs` do shadcn). Tabelas `print_agent`, `impressora`, `fila_impressao`, enums e RPCs `reimprimir_etiqueta` / `cancelar_job_impressao` já existem no banco — nenhuma alteração de schema.

### Arquivos a criar

1. **`src/pages/ImpressaoConfigPage.tsx`** — casca com título, ícone `Printer`, subtítulo e `Tabs`. Recebe `onNavigate`.
2. **`src/components/impressao/AgentsTab.tsx`**
3. **`src/components/impressao/ImpressorasTab.tsx`**
4. **`src/components/impressao/FilaImpressaoTab.tsx`**

### Aba 1 — Agents (CRUD padrão)

- `useCrud({ table: "print_agent", tenantId, orderBy: "nome", select: "*, armazem:armazem_id(descricao)" })`.
- Colunas: Nome, Armazém (`row.armazem?.descricao`), Hostname (mono), Versão (mono), IP Local (mono), Status (badge ONLINE verde / OFFLINE vermelho), Último Heartbeat (helper "há Xs / há Xmin / data / Nunca"), Chave API (8 chars + `…` + botão `Copy`), Ativo.
- Ação extra por linha: botão `Copy` → `navigator.clipboard.writeText(row.chave_api)` + `toast.success`.
- Busca client-side: `nome`, `hostname`.
- Modal (`CrudModal`) via `Sheet` lateral: `nome*`, `armazem_id*` (dropdown armazéns ativos do tenant/empresa), `intervalo_polling_ms*` (default 2000, min 500, max 10000), `ativo` (switch, default true). `tenant_id`/`chave_api` cuidados pelo banco.

### Aba 2 — Impressoras (CRUD com seções + condicionais)

- `useCrud({ table: "impressora", tenantId, orderBy: "nome", select: "*, print_agent:agent_id(nome), armazem:armazem_id(descricao)" })`.
- Colunas: Nome, Código (mono), Setor (badge por `setor_uso`), Conexão, Endereço (`ip:porta` se REDE, senão `nome_sistema` ou "—"), Linguagem (badge), Agent, Status (badge com `Wifi`/`WifiOff`), Ativo.
- Busca: `nome`, `codigo`, `endereco_ip`.
- Modal seccionado (Identificação / Conexão / Configuração Técnica):
  - Identificação: `nome*`, `codigo*`, `setor_uso*`, `agent_id` (agents ativos).
  - Conexão: `tipo_conexao*` (USB default). Se REDE → `endereco_ip*` + `porta` (default 9100). Se USB/BLUETOOTH → `nome_sistema`. Campos escondidos condicionalmente.
  - Técnica: `linguagem*` (ZPL), `largura_mm*` (100), `altura_mm*` (40), `dpi*` (203|300, default 203).
- `empresa_id` e `armazem_id` preenchidos automaticamente a partir do `useTenant()` no submit.

### Aba 3 — Fila de Impressão (monitor)

- `useState`/`useEffect` com `supabase.from("fila_impressao").select("*, impressora:impressora_id(nome, codigo), etiqueta_template:template_id(nome, tipo)").eq("tenant_id", tenantId).eq("armazem_id", armazemId).order("criado_em", { ascending: false }).limit(100)` + filtros condicionais.
- 4 stats cards: Pendentes (amarelo, `Clock`), Processando (azul, `Loader2` spinner), Impressos hoje (verde, `CheckCircle2`), Erros hoje (vermelho, `AlertCircle`).
- Filtros: Select Status, Select Impressora, Select Origem, botão `RefreshCw`; texto "Atualização automática a cada 10s".
- Tabela conforme spec: data `DD/MM HH:mm:ss` via `formatDateTime` (`@/utils/dateTime.ts`), badges por origem/status, tentativas `x/y`, erro truncado com tooltip, `impresso_em` quando aplicável.
- Ações por linha:
  - Reimprimir (`RotateCcw`) → `supabase.rpc("reimprimir_etiqueta", { p_job_original_id: row.id })`.
  - Cancelar (`Ban`, só PENDENTE/ERRO/REIMPRESSAO) → confirm + `supabase.rpc("cancelar_job_impressao", { p_job_id: row.id })`.
  - Toasts via `parseError`.
- `setInterval(fetch, 10000)` + cleanup. Realtime opcional em `supabase.channel` filtrando `armazem_id=eq.${armazemId}` (subscribe dentro do `useEffect`, `removeChannel` no cleanup).

### Integração de rotas e menu

- **`src/App.tsx`**: import `ImpressaoConfigPage`; `case "/config/impressao": return <ImpressaoConfigPage onNavigate={onNavigate} />;`; breadcrumb `[CORE LogiTrack, Configurações, Impressão]`.
- **`src/components/TopNav.tsx`**: novo item `{ label: "Impressão", icon: Printer, route: "/config/impressao" }` no grupo Configurações, abaixo de "Templates de Etiqueta".

### Migration final — RBAC

Após o frontend, uma única migration (via `supabase--migration`) para registrar o módulo no tenant CORE LogiTrack:

- `INSERT INTO public.modulo` (`nome="Impressão"`, `rota="/config/impressao"`, `ambiente=WEB`, `ativo=true`, `tenant_id` do CORE LogiTrack) — `ON CONFLICT DO NOTHING` pela rota+tenant.
- `INSERT INTO public.permissao` com ações padrão (`READ`, `CREATE`, `UPDATE`, `DELETE`, `EXECUTE`) para o novo módulo.
- Vincular todas as permissões ao perfil `ADMINISTRADOR` do tenant via `INSERT INTO public.perfil_permissao`.
- Idempotente (todos os `INSERT` com `ON CONFLICT DO NOTHING`) para permitir re-execução segura.

### Detalhes técnicos

- Datas via `formatDateTime` (regra Core do projeto).
- Erros via `parseError` + `toast` (padrão unificado).
- Casts `as any` para campos que possam ainda não estar em `types.ts` (regenera após migration).
- Sem novas dependências.

### Fora de escopo

- Nenhuma alteração em enums, RPCs, RLS ou schema das tabelas de impressão.
- Sem página no Coletor e sem execução real de impressão — a aba Fila apenas monitora.