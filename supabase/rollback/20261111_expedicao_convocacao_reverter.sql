-- =============================================================================
-- REVERSÃO — Convocação híbrida por etapa da onda (migrations 20261111150000..150500)
-- NÃO é migration automática: rodar manualmente, só com aprovação, e SÓ depois de
-- voltar o front-end para a versão anterior (o front novo chama as RPCs removidas aqui).
--
-- O que volta:   funções do coletor/conferência originais, gatilhos removidos,
--                status/liberado_em das atribuições como estavam no deploy,
--                constraint antiga uq_tarefa_atribuicao_tarefa_usuario.
-- O que fica:    tabelas movimento_saida_etapa / movimento_saida_responsavel (inertes,
--                para auditoria), colunas novas (inertes), valor REATRIBUICAO do enum
--                (Postgres não remove valor de enum), backups *_bkp_20261111.
-- =============================================================================
BEGIN;

-- 1. Gatilhos novos
DROP TRIGGER IF EXISTS trg_a_mov_saida_etapas            ON public.movimento_saida;
DROP TRIGGER IF EXISTS trg_tarefa_execucao_valida_dono   ON public.tarefa_execucao;
DROP TRIGGER IF EXISTS trg_tarefa_encerrar_atribuicao    ON public.tarefa;
DROP TRIGGER IF EXISTS trg_tipo_saida_valida_zona        ON public.tipo_saida;
DROP TRIGGER IF EXISTS trg_agrupamento_separacao_valida_zona ON public.agrupamento_separacao;
DROP TRIGGER IF EXISTS trg_tipo_tarefa_etapa_onda        ON public.tipo_tarefa;

-- 2. Funções originais a partir dos backups (mesma assinatura, mesmo SECURITY)
DO $$
DECLARE r record; v_def text; v_nome text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN (
      'fn_gerar_conferencia_saida_bkp_20261111', 'fn_conferencia_validar_onda_bkp_20261111',
      'conferencia_buscar_tarefas_bkp_20261111', 'separacao_buscar_ondas_bkp_20261111',
      'separacao_buscar_tarefas_bkp_20261111')
  LOOP
    v_nome := replace(r.proname, '_bkp_20261111', '');
    v_def  := replace(pg_get_functiondef(r.oid),
                      'FUNCTION public.' || r.proname || '(', 'FUNCTION public.' || v_nome || '(');
    EXECUTE v_def;
  END LOOP;
END $$;

-- 3. Funções novas
DROP FUNCTION IF EXISTS public.rpc_onda_responsaveis_salvar(uuid, jsonb, boolean, text, boolean, uuid);
DROP FUNCTION IF EXISTS public.rpc_onda_operadores_elegiveis(uuid, uuid, text, uuid);
DROP FUNCTION IF EXISTS public.rpc_onda_responsaveis_obter(uuid, uuid);
DROP FUNCTION IF EXISTS public.rpc_coletor_onda_resumo(uuid, uuid, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.rpc_coletor_assumir_etapa(uuid, uuid, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.rpc_coletor_sair_etapa(uuid, uuid, uuid, uuid, text);
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS f FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname IN (
             '_fn_gestor_sessao', '_fn_usuario_pode_convocar', '_fn_usuario_elegivel_etapa',
             'fn_onda_aplicar_responsaveis', '_fn_onda_assumir', 'fn_onda_usuario_pode_executar',
             'fn_onda_snapshot_etapas', 'fn_onda_etapa_info', '_fn_onda_etapa_calcular',
             'assert_usuario_sessao', 'tg_mov_saida_etapas_liberacao', 'tg_tarefa_execucao_valida_dono',
             'tg_tarefa_encerrar_atribuicao', 'tg_tipo_saida_valida_zona',
             'tg_agrupamento_separacao_valida_zona', 'tg_tipo_tarefa_etapa_onda_padrao')
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s', r.f);
  END LOOP;
END $$;

-- 4. Atribuições: guarda as linhas que impedem a constraint antiga e devolve o estado do deploy
ALTER TABLE public.tarefa_atribuicao
  DROP CONSTRAINT IF EXISTS ck_tarefa_atribuicao_aberta,
  DROP CONSTRAINT IF EXISTS ck_tarefa_atribuicao_motivo,
  DROP CONSTRAINT IF EXISTS ck_tarefa_atribuicao_status;

CREATE TABLE IF NOT EXISTS public.bkp_tarefa_atribuicao_reversao_20261111 AS
SELECT ta.*, now() AS removido_em FROM public.tarefa_atribuicao ta WHERE false;
ALTER TABLE public.bkp_tarefa_atribuicao_reversao_20261111 ENABLE ROW LEVEL SECURITY;

-- (tarefa, usuário) repetidos: mantém a linha aberta ou a mais recente; as outras vão para o backup
WITH dup AS (
  SELECT id, row_number() OVER (PARTITION BY tarefa_id, usuario_id
           ORDER BY (liberado_em IS NULL) DESC, atribuido_em DESC, id) AS rn
  FROM public.tarefa_atribuicao
), mov AS (
  DELETE FROM public.tarefa_atribuicao ta USING dup
  WHERE dup.id = ta.id AND dup.rn > 1
  RETURNING ta.*
)
INSERT INTO public.bkp_tarefa_atribuicao_reversao_20261111 SELECT mov.*, now() FROM mov;

UPDATE public.tarefa_atribuicao ta
   SET status = b.status, liberado_em = b.liberado_em, motivo_liberacao = NULL, liberado_por = NULL
  FROM public.bkp_tarefa_atribuicao_20261111 b
 WHERE b.id = ta.id
   AND (ta.status IS DISTINCT FROM b.status OR ta.liberado_em IS DISTINCT FROM b.liberado_em);

DROP INDEX IF EXISTS public.uq_tarefa_atribuicao_dono_aberto;
DROP INDEX IF EXISTS public.idx_tarefa_atribuicao_usuario_aberta;
ALTER TABLE public.tarefa_atribuicao
  ADD CONSTRAINT uq_tarefa_atribuicao_tarefa_usuario UNIQUE (tarefa_id, usuario_id);

COMMIT;
