-- Reversão do Status S2 (situação do pedido) — migrations 20261123200000 … 20261123200400.
-- Uma transação, com conferência no fim. Os valores das colunas novas são descartados
-- (recalculáveis a partir de onda, carga e entrega). "Marcar como exportado" volta a mudar
-- a onda para EXPORTADA_ERP / o recebimento para EXPORTADO (comportamento do S1).

BEGIN;

-- 1) gatilhos e funções do cálculo
DROP TRIGGER IF EXISTS trg_zz_situacao_doc_saida_ins     ON public.documento_saida;
DROP TRIGGER IF EXISTS trg_zz_situacao_doc_saida_upd     ON public.documento_saida;
DROP TRIGGER IF EXISTS trg_zz_situacao_mov_saida         ON public.movimento_saida;
DROP TRIGGER IF EXISTS trg_zz_situacao_mov_saida_doc     ON public.movimento_saida_documento;
DROP TRIGGER IF EXISTS trg_zz_situacao_carga             ON public.carga;
DROP TRIGGER IF EXISTS trg_zz_situacao_carga_doc         ON public.carga_documento;
DROP TRIGGER IF EXISTS trg_zz_situacao_entrega           ON public.entrega;
DROP TRIGGER IF EXISTS trg_zz_situacao_entrega_parada    ON public.entrega_parada;
DROP TRIGGER IF EXISTS trg_zz_situacao_entrega_tentativa ON public.entrega_tentativa;
DROP FUNCTION IF EXISTS public.trg_pedido_situacao();
DROP FUNCTION IF EXISTS public._fn_pedido_situacao_recalcular(uuid);
DROP FUNCTION IF EXISTS public._fn_onda_entrega_resumo(uuid);
DROP FUNCTION IF EXISTS public._fn_pedido_situacao_calcular(uuid);
DROP FUNCTION IF EXISTS public.rpc_pedidos_acompanhamento(uuid, date, date, text, text[], text[], text[], text, integer, integer);
DROP FUNCTION IF EXISTS public.rpc_pedido_situacao(uuid);
DROP FUNCTION IF EXISTS public._fn_situacao_pedido_autorizar(uuid);

-- 2) "marcar exportado" como no S1
CREATE OR REPLACE FUNCTION integracao._fn_movimento_integracao_resumo(p_tabela text, p_movimento_id uuid, p_exportar boolean DEFAULT false)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'integracao'
AS $function$
DECLARE
  c_ordem constant text[] := ARRAY['nao_integra', 'ignorado', 'integrado', 'pendente', 'erro'];
  v_pos   int;
  v_res   text;
BEGIN
  IF p_tabela = 'movimento_saida' THEN
    SELECT max(array_position(c_ordem, d.integracao_estado)) INTO v_pos
      FROM movimento_saida_documento msd
      JOIN documento_saida d ON d.id = msd.documento_saida_id
     WHERE msd.movimento_saida_id = p_movimento_id
       AND d.status NOT IN (9, 99);
    v_res := coalesce(c_ordem[v_pos], 'nao_integra');
    UPDATE movimento_saida SET integracao_resumo = v_res
     WHERE id = p_movimento_id AND integracao_resumo IS DISTINCT FROM v_res;
    IF p_exportar AND v_res NOT IN ('erro', 'pendente') THEN
      UPDATE movimento_saida SET status = 'EXPORTADA_ERP'
       WHERE id = p_movimento_id AND status = 'CONCLUIDA';
    END IF;
  ELSIF p_tabela = 'movimento_entrada' THEN
    SELECT max(array_position(c_ordem, d.integracao_estado)) INTO v_pos
      FROM movimento_entrada_documento med
      JOIN documento_entrada d ON d.id = med.documento_entrada_id
     WHERE med.movimento_entrada_id = p_movimento_id
       AND d.status NOT IN (8, 9, 99);
    v_res := coalesce(c_ordem[v_pos], 'nao_integra');
    UPDATE movimento_entrada SET integracao_resumo = v_res
     WHERE id = p_movimento_id AND integracao_resumo IS DISTINCT FROM v_res;
    IF p_exportar AND v_res NOT IN ('erro', 'pendente') THEN
      UPDATE movimento_entrada SET status = 'EXPORTADO'
       WHERE id = p_movimento_id AND status = 'ARMAZENADO';
    END IF;
  END IF;
  RETURN v_res;
END;
$function$;
REVOKE ALL ON FUNCTION integracao._fn_movimento_integracao_resumo(text, uuid, boolean) FROM PUBLIC, anon, authenticated;

-- 3) painel de TV, cancelamento de entrada, lista de ondas e entrega (trocas de trecho desfeitas)
DO $rev$
DECLARE
  v_sig text; v_def text;
  v_int constant text := $t$(v_me.status = 'ARMAZENADO' AND EXISTS (SELECT 1 FROM documento_entrada x WHERE x.id = v_doc.id AND x.integracao_estado = 'integrado' AND x.integracao_evento = 'entrada.armazenagem_finalizada'))$t$;
BEGIN
  v_sig := 'public.rpc_painel_tv_operacional(text)';
  v_def := pg_get_functiondef(v_sig::regprocedure);
  v_def := replace(v_def, $t$AND ms.status <> 'CANCELADA'$t$, $t$AND ms.status NOT IN ('CANCELADA', 'EXPORTADA_ERP')$t$);
  v_def := replace(v_def, $t$COUNT(*) FILTER (WHERE status IN ('CONCLUIDA', 'EXPORTADA_ERP'))$t$, $t$COUNT(*) FILTER (WHERE status = 'CONCLUIDA')$t$);
  EXECUTE v_def;

  v_sig := 'public.fn_cancelar_documento_entrada(uuid,uuid,uuid,text,text,text)';
  v_def := pg_get_functiondef(v_sig::regprocedure);
  v_def := replace(v_def, ' AND NOT ' || v_int || ' THEN', ' THEN');
  v_def := replace(v_def, ' OR ' || v_int || ' THEN', ' THEN');
  EXECUTE v_def;

  v_sig := 'public.rpc_ondas_carregamento_lista(uuid,text,date,date,bigint,bigint,uuid,text,text,text,integer,integer,text,text)';
  v_def := pg_get_functiondef(v_sig::regprocedure);
  IF position('entrega_resumo' in v_def) > 0 THEN
    v_def := replace(v_def, ', entrega_resumo text, entrega_total integer, entrega_entregues integer, entrega_nao_entregues integer)', ')');
    v_def := replace(v_def, $t$,
         ms.entrega_resumo, ms.entrega_total, ms.entrega_entregues, ms.entrega_nao_entregues$t$, '');
    EXECUTE 'DROP FUNCTION ' || v_sig;
    EXECUTE v_def;
    EXECUTE 'REVOKE ALL ON FUNCTION ' || v_sig || ' FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION ' || v_sig || ' TO authenticated, service_role';
  END IF;

  v_sig := 'public._fn_entrega_json(uuid)';
  v_def := pg_get_functiondef(v_sig::regprocedure);
  v_def := replace(v_def, $t$
        'integracao', integracao.fn_documento_integracao_json('documento_saida', p.documento_saida_id),
        'situacao', jsonb_build_object('etapa', ds.etapa, 'entrega_status', ds.entrega_status, 'entrega_motivo', ds.entrega_motivo),$t$, '');
  EXECUTE v_def;
END
$rev$;

-- 4) colunas (restrições e índices saem junto)
DROP INDEX IF EXISTS public.idx_documento_saida_situacao;
DROP INDEX IF EXISTS public.idx_documento_saida_entrega_pendencia;
ALTER TABLE public.documento_saida
  DROP COLUMN IF EXISTS etapa, DROP COLUMN IF EXISTS etapa_em, DROP COLUMN IF EXISTS etapa_onda_numero,
  DROP COLUMN IF EXISTS etapa_carga_numero, DROP COLUMN IF EXISTS entrega_status, DROP COLUMN IF EXISTS entrega_em,
  DROP COLUMN IF EXISTS entrega_motivo, DROP COLUMN IF EXISTS entrega_tentativas;
ALTER TABLE public.movimento_saida
  DROP COLUMN IF EXISTS entrega_resumo, DROP COLUMN IF EXISTS entrega_total,
  DROP COLUMN IF EXISTS entrega_entregues, DROP COLUMN IF EXISTS entrega_nao_entregues;

-- 5) conferência
DO $conf$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
              AND table_name IN ('documento_saida', 'movimento_saida') AND column_name IN ('etapa', 'entrega_status', 'entrega_resumo'))
     OR to_regprocedure('public._fn_pedido_situacao_calcular(uuid)') IS NOT NULL
     OR position('entrega_resumo' in pg_get_functiondef('public.rpc_ondas_carregamento_lista(uuid,text,date,date,bigint,bigint,uuid,text,text,text,integer,integer,text,text)'::regprocedure)) > 0
     OR position('situacao' in pg_get_functiondef('public._fn_entrega_json(uuid)'::regprocedure)) > 0
     OR position('entrada.armazenagem_finalizada' in pg_get_functiondef('public.fn_cancelar_documento_entrada(uuid,uuid,uuid,text,text,text)'::regprocedure)) > 0
     OR position('EXPORTADA_ERP' in pg_get_functiondef('integracao._fn_movimento_integracao_resumo(text,uuid,boolean)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Reversão do S2 incompleta';
  END IF;
END
$conf$;

COMMIT;
