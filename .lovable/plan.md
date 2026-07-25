## Auditoria de módulos RBAC — tenant CORE LogiTrack

Comparei as rotas registradas em `src/App.tsx` (bloco WEB) com os módulos existentes na tabela `modulo` do tenant `CORE LogiTrack` (`f89963dc-9afc-49be-8b70-3559c9fd80bd`). Todos os 7 módulos do ambiente COLETOR e a maior parte dos módulos WEB já estão cadastrados corretamente com suas permissões.

### Módulos faltantes identificados

| Rota (App.tsx) | Módulo esperado | Página | Ações |
|---|---|---|---|
| `/atividades/operadores-ativos` | `web.atividades.operadores-ativos` | `OperadoresAtivosPage` | READ |
| `/atividades/tarefas-ativas` | `web.atividades.tarefas-ativas` | `TarefasAtivasPage` | READ |
| `/relatorios/picking-nao-cadastrado` | `web.relatorios.picking-nao-cadastrado` | `PickingNaoCadastradoReportPage` | READ |
| `/config/ocorrencia-sla` | `web.config.ocorrencia-sla` | `OcorrenciaSlaConfigPage` | CREATE, READ, UPDATE, DELETE |

Sem esses registros, `ProtectedRoute` bloqueia o acesso a essas telas mesmo para perfis não-administradores, e a tela "Perfis de Acesso" não permite conceder acesso.

### O que a migration fará

Somente para o tenant `f89963dc-9afc-49be-8b70-3559c9fd80bd`:

1. `INSERT` idempotente em `public.modulo` (com `ON CONFLICT` no par `tenant_id, codigo`) para os 4 códigos acima, ambiente `WEB`.
2. `INSERT` idempotente em `public.permissao` das ações correspondentes:
   - `READ` para os 3 módulos de monitoramento/relatório.
   - `CREATE`, `READ`, `UPDATE`, `DELETE` para `web.config.ocorrencia-sla` (tela de cadastro).
3. Vincular todas as novas permissões ao perfil `ADMINISTRADOR` do tenant em `public.perfil_permissao` (mantém o comportamento atual em que o admin já enxerga tudo — sem quebrar perfis existentes).

Nenhuma alteração de estrutura de tabelas, RLS ou grants. Nenhum outro tenant é afetado.

### Nota fora do escopo

O mapa `src/hooks/useRoutePermission.ts` também não lista essas rotas, mas o próprio `getModuleForRoute` retorna `null` para elas hoje e a UI segue funcionando (as páginas são acessadas via botão). Se quiser que passem a exigir permissão explícita, posso incluir a atualização do mapa em um passo separado — me avise.
