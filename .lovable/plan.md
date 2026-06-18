## Novo Relatório: Cancelamentos de Tarefas

Implementação completa seguindo o prompt anexado e o padrão do relatório de **Cortes da Separação** (referência principal). Inclui o seed de RBAC para o novo módulo.

---

### 1. Arquivos a criar

```
src/modules/reports/cancelamentos/
├── cancelamentos.service.ts    # query Supabase + tipos + filtros + fetch de selects
└── CancelamentosPage.tsx       # página (ReportHeader + filtros + KPIs + ReportTable)
```

- `service`: select aninhado em `tarefa_execucao` (status=CANCELADA) com joins para `tarefa → tipo_tarefa/produto`, `usuario_id` (operador), `usuario_corte` (quem cancelou), `motivo_ocorrencia`, `endereco_origem`/`endereco_destino`. Filtros: período (`concluido_em`), `empresa_id`/`armazem_id` (via `tarefa.*`), `tipo_tarefa_id`, `sku` (busca parcial), `usuario_corte`. Range/paginação no Supabase quando >500 registros. Funções auxiliares `fetchTiposTarefa` e `fetchUsuariosAtivos`.
- `page`: usa `useTenant()` (tenantId, empresaId, armazemId, empresaVersion, usuarioNome), `ReportHeader`, `ReportTable`, exporters padrão (`exportToExcel`/`exportToPdf` em landscape), 4 KPIs (Total, Qtd cancelada, Tipos afetados, Período), empty state e loader, mesmas convenções dos relatórios atuais (datas via `src/utils/dateTime.ts`).

### 2. Registro de rota e navegação

- `src/App.tsx`: import lazy de `CancelamentosPage`, novo `case "/relatorios/cancelamentos"` no `renderPage()`, e entrada de breadcrumb `{ label: "Cancelamentos de Tarefas", parent: "/relatorios" }`.
- `src/components/TopNav.tsx`: novo item na seção Relatórios com ícone `Ban` (Lucide), protegido por permissão `web.relatorios.cancelamentos`.

### 3. Seed de RBAC (`modulo` + `permissao`)

Único tenant ativo identificado: `f89963dc-9afc-49be-8b70-3559c9fd80bd`. Os relatórios existentes seguem o padrão de código `web.relatorios.<slug>` com 4 ações (CREATE, READ, UPDATE, DELETE). Será aplicada via `supabase--insert`:

```sql
WITH novo_modulo AS (
  INSERT INTO public.modulo (id, tenant_id, codigo, descricao, ambiente, ativo)
  VALUES (
    gen_random_uuid(),
    'f89963dc-9afc-49be-8b70-3559c9fd80bd',
    'web.relatorios.cancelamentos',
    'Cancelamentos de Tarefas',
    'WEB',
    true
  )
  RETURNING id, tenant_id
)
INSERT INTO public.permissao (id, tenant_id, modulo_id, acao, descricao)
SELECT gen_random_uuid(), tenant_id, id, acao::enum_acao_permissao, acao
FROM novo_modulo
CROSS JOIN (VALUES ('CREATE'),('READ'),('UPDATE'),('DELETE')) AS a(acao);
```

> O insert é idempotente: se o módulo já existir para o tenant a operação aborta sem duplicar (UNIQUE em `tenant_id, codigo`). Para tenants futuros, repetir o script substituindo o `tenant_id`.

### 4. Regras invioláveis respeitadas

- Multi-tenant em todas as queries (`tenant_id` + RLS já existente).
- Datas/horários renderizados via `src/utils/dateTime.ts` (Brasília).
- Nenhuma nova dependência: usa `xlsx`/`jspdf` já presentes em `utils/exporters.ts`.
- Sem alteração de views/edge functions/RPC.
- UI dark, denso, alinhado ao relatório de Cortes.

### Ordem de execução

1. Rodar o `supabase--insert` (módulo + permissões).
2. Criar `cancelamentos.service.ts` e `CancelamentosPage.tsx`.
3. Editar `App.tsx` (lazy + case + breadcrumb) e `TopNav.tsx` (item de menu com `PermissionGate`).
4. Verificar build e abrir `/relatorios/cancelamentos`.
