
-- =============================================
-- FASE 2: Infraestrutura Analítica LMS
-- =============================================

-- 2.1 Tabela de métricas diárias consolidadas
CREATE TABLE public.lms_metrica_diaria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant(id),
  empresa_id uuid NOT NULL REFERENCES public.empresa(id),
  armazem_id uuid NOT NULL REFERENCES public.armazem(id),
  usuario_id uuid NOT NULL REFERENCES public.usuario(id),
  data_referencia date NOT NULL,
  turno_id uuid REFERENCES public.turnos(id),
  -- Tempos (segundos)
  tempo_produtivo integer DEFAULT 0,
  tempo_ocioso integer DEFAULT 0,
  tempo_auxiliar integer DEFAULT 0,
  tempo_jornada integer DEFAULT 0,
  -- Contadores
  tarefas_concluidas integer DEFAULT 0,
  tarefas_canceladas integer DEFAULT 0,
  quantidade_total numeric DEFAULT 0,
  peso_total numeric DEFAULT 0,
  documentos_processados integer DEFAULT 0,
  skus_distintos integer DEFAULT 0,
  -- Calculados
  taxa_ocupacao numeric DEFAULT 0,
  produtividade_hora numeric DEFAULT 0,
  UNIQUE (tenant_id, usuario_id, data_referencia)
);

ALTER TABLE public.lms_metrica_diaria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lms_metrica_diaria_tenant_policy"
  ON public.lms_metrica_diaria
  FOR ALL
  USING (tenant_id = get_current_tenant())
  WITH CHECK (tenant_id = get_current_tenant());

-- 2.2 Tabela de métricas por tipo de tarefa
CREATE TABLE public.lms_metrica_tipo_tarefa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant(id),
  usuario_id uuid NOT NULL REFERENCES public.usuario(id),
  data_referencia date NOT NULL,
  tipo_tarefa_id uuid NOT NULL REFERENCES public.tipo_tarefa(id),
  tempo_medio_segundos integer DEFAULT 0,
  tempo_total_segundos integer DEFAULT 0,
  tarefas_concluidas integer DEFAULT 0,
  quantidade_total numeric DEFAULT 0,
  UNIQUE (tenant_id, usuario_id, data_referencia, tipo_tarefa_id)
);

ALTER TABLE public.lms_metrica_tipo_tarefa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lms_metrica_tipo_tarefa_tenant_policy"
  ON public.lms_metrica_tipo_tarefa
  FOR ALL
  USING (tenant_id = get_current_tenant())
  WITH CHECK (tenant_id = get_current_tenant());

-- 2.3 View analítica para timeline Gantt
CREATE OR REPLACE VIEW public.vw_lms_timeline_operador AS
SELECT
  te.tenant_id,
  te.usuario_id,
  u.nome AS usuario_nome,
  u.habilidade,
  u.tipo_operacao,
  u.turno_id,
  tn.descricao AS turno_descricao,
  tn.hora_inicio AS turno_inicio,
  tn.hora_fim AS turno_fim,
  te.id AS execucao_id,
  te.tarefa_id,
  tt.codigo AS tipo_tarefa_codigo,
  tt.descricao AS tipo_tarefa_descricao,
  te.status,
  te.atribuido_em,
  te.iniciado_em,
  te.concluido_em,
  te.quantidade_executada,
  te.quantidade_cortada,
  t.quantidade_requerida,
  t.tipo_documento_origem,
  t.id_documento_origem,
  t.armazem_id,
  t.empresa_id,
  EXTRACT(EPOCH FROM (te.concluido_em - te.iniciado_em)) AS duracao_segundos,
  EXTRACT(EPOCH FROM (te.iniciado_em - te.atribuido_em)) AS espera_segundos,
  tt.tempo_estimado_segundos
FROM tarefa_execucao te
JOIN tarefa t ON t.id = te.tarefa_id
JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id
JOIN usuario u ON u.id = te.usuario_id
LEFT JOIN turnos tn ON tn.id = u.turno_id;

-- 2.4 Índices analíticos
CREATE INDEX IF NOT EXISTS idx_exec_usuario_periodo
  ON tarefa_execucao (tenant_id, usuario_id, concluido_em);

CREATE INDEX IF NOT EXISTS idx_exec_concluido
  ON tarefa_execucao (tenant_id, concluido_em)
  WHERE status = 'CONCLUIDA';

CREATE INDEX IF NOT EXISTS idx_sessao_usuario_periodo
  ON log_sessao_usuario (tenant_id, usuario_id, inicio_sessao);
