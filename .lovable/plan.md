## Objetivo
Registrar o módulo `web.config.tipos-tarefa` (rota `/config/tipos-tarefa` — tela "Tipos de Tarefa") na base para que ele apareça no gerenciador de Perfis de Acesso e possa ter permissões atribuídas, seguindo o mesmo padrão dos demais módulos de Configurações.

## Constatações
- A rota existe (`TiposTarefaPage`), está registrada em `App.tsx` e já é exibida no menu `TopNav > Configurações`.
- `useRoutePermission.ts` já resolve o código do módulo por convenção (`/config/tipos-tarefa` → `web.config.tipos-tarefa`), então não precisa alterar o mapa.
- Na tabela `modulo` existem apenas os quatro pares de config (`empresas`, `usuarios`, `integracao`, `perfis`), cada um com 4 permissões (`CREATE`, `READ`, `UPDATE`, `DELETE`). Falta o registro para `tipos-tarefa`.
- Só há 1 tenant na base (`f89963dc-...`), mas a inserção será feita para todos os tenants existentes (idempotente) para não quebrar quando novos tenants surgirem via suporte.

## Migração (via tool de migration)
1. Inserir em `public.modulo` uma linha por tenant existente:
   - `codigo = 'web.config.tipos-tarefa'`
   - `descricao = 'Tipos de Tarefa'`
   - `ambiente = 'WEB'`
   - `ativo = true`
   - `ON CONFLICT (tenant_id, codigo) DO NOTHING` (usa índice único existente; se não existir, usar `WHERE NOT EXISTS`).
2. Inserir em `public.permissao` as 4 ações (`CREATE`, `READ`, `UPDATE`, `DELETE`) para o módulo recém-criado, também idempotente.

Nenhuma alteração de código/frontend é necessária — o menu já filtra por `web.config.tipos-tarefa` automaticamente. Após a migração, basta atribuir a permissão ao perfil desejado em `/config/perfis`.

## Observação
Perfis existentes não receberão a permissão automaticamente — o administrador precisará marcá-la no perfil apropriado (mesmo comportamento dos demais módulos).