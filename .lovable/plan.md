
## Plano — SLA de Ocorrências + Correções e Melhorias

Escopo 100% frontend. Backend (tabelas, RPCs, buckets) já pronto.

### 1. Nova tela: SLA de Ocorrências

**Arquivo novo:** `src/pages/OcorrenciaSlaConfigPage.tsx`
- Padrão CRUD (mesmo modelo de `MotivosOcorrenciaPage.tsx`): `useCrud` sobre a tabela `ocorrencia_sla_config`, `CrudTable` + `CrudModal` + `DeleteConfirmDialog`.
- Colunas: Prioridade (badge colorido BAIXA/NORMAL/ALTA/CRITICA), SLA (horas), Alerta em (%), Ativo (badge).
- Campos do form: `prioridade` (enum), `sla_horas` (number), `notificar_percentual` (number, default 80), `ativo` (switch, default true).
- `handleSave` injeta `armazem_id` do `TenantContext` quando disponível.
- Título "SLA de Ocorrências", botão "Novo SLA", search "Buscar SLA...", orderBy `prioridade`.

**Rota:** em `src/App.tsx`, seguindo convenção do projeto (`/config/*`, não `/configuracoes/*`):
- `case "/config/ocorrencia-sla": return <OcorrenciaSlaConfigPage />;`
- Breadcrumb correspondente.
- Item de menu em `TopNav.tsx` no submenu de Configurações com ícone `Clock`, label "SLA de Ocorrências", path `/config/ocorrencia-sla`.

### 2. `MotivosOcorrenciaPage.tsx` — trocar bloqueio_estoque por tipo_ocorrencia_padrao

- Remover coluna e campo `bloqueio_estoque` (consolidado em `acao_automatica = BLOQUEAR_ESTOQUE`).
- Adicionar coluna "Tipo Padrão" (após coluna de etapa) com labels amigáveis para os 9 valores do enum.
- Adicionar campo `tipo_ocorrencia_padrao` (enum, opcional) no form logo após `etapa_ocorrencia`.

### 3. Quantidades automáticas no contexto do coletor

**3.1** `src/components/ocorrencia/RegistrarOcorrenciaModal.tsx` — adicionar `quantidade_esperada?: number` e `quantidade_real?: number` à interface `OcorrenciaContexto`.

**3.2** `RegistrarOcorrenciaColetorButton.tsx` — no `useEffect` de reset ao abrir, usar `contexto.quantidade_esperada`/`quantidade_real` como default (fallback `"0"`).

**3.3** Passar quantidades no contexto:
- `ConferenciaProdutoPage.tsx`: `quantidade_esperada = tarefa.quantidade_requerida`, `quantidade_real = qtdConferida`.
- `AbastecimentoColetaPage.tsx`, `AbastecimentoDestinoPage.tsx`, `ArmazenagemExecucaoPage.tsx`: `quantidade_esperada = qtdRestante` (variável já existente em cada tela; confirmar nome ao editar).
- Não alterar Inventário nem Separação.

### 4. Upload de evidência fotográfica no coletor

Alterações em `RegistrarOcorrenciaColetorButton.tsx`:
- Estado: `foto`, `fotoPreview`, `uploading`. Handler `handleFotoChange` (FileReader → dataURL).
- UI: bloco "Evidência (opcional)" abaixo da lista de motivos e acima do toggle de detalhes — label com `<input type="file" accept="image/*" capture="environment">`, botão de remover, preview `<img>`.
- No `submit`, antes da RPC: upload para `supabase.storage.from("evidencias")` em `${tenantId}/ocorrencias/${Date.now()}.${ext}`. Falha de upload apenas emite `toast.error` e segue sem foto (nunca bloqueia).
- Após sucesso da RPC (`result.ocorrencia_id`) com `evidenciaUrl` obtido via `getPublicUrl`, `UPDATE ocorrencia_operacional SET evidencia_url = ...`.
- `canSubmit` inclui `!uploading`; botão mostra "Enviando foto..." durante upload.
- Reset ao abrir limpa `foto`/`fotoPreview`.
- Imports: `Camera`, `X` de `lucide-react`.

### 5. Links clicáveis em `OcorrenciaDetalhePage.tsx`

- **Tarefa clicável**: usar `ocorrencia.tarefa_execucao_id` (quando presente) para navegar até `/relatorios/movimentacoes/tarefa/:id` — rota existente no App.tsx. Quando só houver `tarefa_id` sem `tarefa_execucao_id`, manter texto mono sem link.
- **Documento de origem**: as rotas `/estoque/movimentos-entrada/:id` e `/estoque/movimentos-saida/:id` NÃO existem hoje. Conforme instrução, manter o ID como texto mono (sem link) com `title="Tela de detalhe em desenvolvimento"`.

### Fora do escopo
Backend/DB, componentes UI base, `SeparacaoOcorrenciasPage.tsx`, `LiberarErroTransporteModal.tsx`, criação de rotas de detalhe de movimento.
