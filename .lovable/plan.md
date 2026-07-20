
Execução integral do documento `plano-acao-ui-logitrack.md`, em duas partes independentes e sequenciais. Cada fase é reversível.

---

## PARTE 1 — Padronização de mensagens (só UI, sem banco)

Infra existente reutilizada (não recriar): `src/lib/errorMapper.ts`, `src/components/feedback/ResultDialog.tsx`, `src/hooks/useResultDialog.ts`, `src/components/feedback/ErrorBoundary.tsx`.

### Fase 1.1 — Login do coletor
- Em `src/pages/coletor/ColetorLoginPage.tsx`, no `catch` do login: importar `parseError` e usar `parsed.title` no `toast.error`, preservando `err.message` como fallback quando `parsed` cair no genérico (espelhar exatamente o padrão do `src/pages/LoginPage.tsx`).
- Não trocar `toast` por dialog; sem outras alterações.

### Fase 1.2 — Coletor: dialogs inline → `ResultDialog`
Páginas: `ConferenciaProdutoPage`, `SeparacaoProdutoPage`, `InventarioProdutoPage`, `InventarioLivreProdutoPage`, `ConferenciaIniciarPage`, `SeparacaoIniciarPage`, `SeparacaoOcorrenciasPage`, `InventarioListPage`.
- Substituir `useState resultDialog` + JSX inline por `const result = useResultDialog({ coletorMode: true })`.
- Mapear: sucesso → `result.showSuccess(msg, { onClose })`; validação → `result.showWarning(msg, { instruction })`; exceção → `result.showError(err, { context })`.
- Unificar `showEanErroDialog` no mesmo padrão (`showWarning` com instrução).
- Renderizar `<ResultDialog {...result.dialogProps} />` no fim. Manter `StatusOverlay`.

### Fase 1.3 — Coletor: `errorDialog` → `ResultDialog`
Páginas: `InventarioEnderecoPage`, `InventarioLivreEnderecoPage`, `SeparacaoEnderecoPage`. Mesma mecânica da 1.2, removendo o estado `errorDialog`.

### Fase 1.4 — Varredura de `toast.error(err.message)` cru
Em lotes: `src/pages/coletor/` → `src/components/` → `src/pages/` → `src/modules/reports/`.
- Substituir por `const parsed = parseError(err, "<contexto>"); toast.error(parsed.title);`, preservando fallback em pt-BR quando `parsed` cair no genérico. Não trocar toast por dialog aqui, não mexer em `try/catch` nem em lógica.

### Checklist Parte 1
- Login do coletor traduz erros; `useResultDialog` com uso > 0; sem dialogs inline no coletor; `errorDialog`/`showEanErroDialog` eliminados; `toast.error(*.message)` reduzido ao mínimo.

---

## PARTE 2 — Etiquetas por empresa

### Fase 2.1 — Banco (via `supabase--migration`)
Criar tabela `public.etiqueta_template` com colunas `id, tenant_id, empresa_id (NULLABLE), tipo (ENDERECO|HU|PRODUTO|VOLUME), nome, tamanho, orientacao, com_cabecalho, com_logo, logo_url, campos jsonb, versao, ativo, created_at/updated_at/by`.
- Índice único parcial `(tenant_id, empresa_id, tipo) WHERE ativo` com `NULLS NOT DISTINCT`.
- GRANTs: `SELECT, INSERT, UPDATE, DELETE` a `authenticated`; `ALL` a `service_role`.
- RLS: `SELECT` amplo dentro do tenant; `INSERT/UPDATE/DELETE` restritos a `tenant_id = get_current_tenant()`.
- Trigger `set_updated_at` (confirmar nome real da função do projeto antes de aplicar).
- RPC `resolver_etiqueta_template(p_tipo, p_empresa_id)` retornando o template com cascata `empresa_id NULLS LAST`.

### Fase 2.2 — Seed padrão por tenant (via `supabase--insert`)
Para cada tenant existente, inserir 4 registros `empresa_id = NULL` (ENDERECO/HU/PRODUTO/VOLUME) com `tamanho='100x40'`, refletindo o layout atual dos 4 previews. Campos em JSONB: `[{chave, label, ativo, ordem}]`. Volume começa com `com_logo=false, com_cabecalho=true`.

### Fase 2.3 — Motor + hook de resolução
- Estender `src/components/etiqueta/thermalEngine.ts` com tipo `EtiquetaConfig` e função `getTemplateFromConfig(config)` mapeando para os `TemplateSpec` existentes. Não recriar o arquivo.
- Criar `src/hooks/useEtiquetaTemplate.ts` chamando a RPC `resolver_etiqueta_template` (padrão `as any`), retornando `{ config, loading }`.
- Nos 4 `Etiqueta*Preview.tsx`, aceitar prop opcional `config?: EtiquetaConfig`. Quando presente, aplicar `tamanho/orientacao/com_cabecalho/com_logo/logo_url` e renderizar só campos `ativo: true` na `ordem`. Sem `config`, comportamento atual (retrocompat).
- `EtiquetaVolumePreview`: remover marca "CORE LogiTrack" hardcoded; se `com_logo && logo_url` renderiza logo da empresa, caso contrário apenas título neutro.

### Fase 2.4 — Tela `EtiquetaTemplatesPage`
- Criar `src/pages/EtiquetaTemplatesPage.tsx` (hash routing, `useTenant`, `PermissionGate`, design system dark).
- Seletor Empresa (ou "Padrão do tenant") + Tipo. Ao selecionar, chama `resolver_etiqueta_template`.
- Controles: tamanho (100x40/50x20/80x20), orientação (H/V), switches "Com cabeçalho" / "Com logo" + upload/URL, lista de campos com switch ativo + reorder (setas). Para VOLUME incluir campos candidatos extras: peso, NF, pedido, transportadora, observação.
- Preview ao vivo à direita, reusando o `Etiqueta*Preview` correspondente com a `config` em edição.
- Salvar: se editando o padrão do tenant e a empresa selecionada é específica, cria novo registro com `empresa_id` (override); senão atualiza o existente. Usar `useCrud` sobre `etiqueta_template` onde aplicável.
- Registrar em `App.tsx` (lazy + `case` no `renderPage`), breadcrumb e entrada em `TopNav.tsx` sob Configurações, gated por `PermissionGate`.

### Fase 2.5 — PrintModals lendo o template resolvido
- Em `PrintEtiquetaEnderecoModal`, `PrintEtiquetaHUModal`, `PrintEtiquetaProdutoModal`, `PrintEtiquetaVolumeModal`: resolver via `useEtiquetaTemplate(tipo, empresaId)` e passar `config` para o preview correspondente. Fluxo `window.open`/`window.print` inalterado. Se não houver template, imprime como hoje.

### Checklist Parte 2
- Tabela + RLS + índice único; RPC de cascata; seed padrão por tenant; previews leem `config`; volume sem marca "CORE LogiTrack"; tela de gerenciamento funcional; PrintModals respeitando template.

---

## Detalhes técnicos

- Sem novas dependências em nenhuma fase.
- Nenhuma alteração em tabela existente na Parte 2 — só criação isolada.
- Confirmar no início da 2.1 o nome real da função de `updated_at` (`set_updated_at` no plano) via `supabase--read_query` antes de aplicar a migration; ajustar se divergir. Confirmar também presença de `get_current_tenant()`.
- Ordem obrigatória de execução: 1.1 → 1.2 → 1.3 → 1.4 → 2.1 → 2.2 → 2.3 → 2.4 → 2.5. Validar build após cada fase.
- Todas as mensagens novas devem passar por `parseError` (Parte 1) ou serem estáticas em pt-BR (Parte 2 UI).
- Design system dark-first, sem cores hardcoded, ícones Lucide, Sonner para toasts, shadcn/ui para modais.
