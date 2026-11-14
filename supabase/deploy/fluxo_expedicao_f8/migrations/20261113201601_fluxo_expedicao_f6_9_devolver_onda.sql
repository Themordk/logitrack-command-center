-- Fluxo de Expedição · F6.9 — devolver a onda ao status anterior ao cancelar a carga / remover a onda
-- 2026-11-13 (QA). Reversão: 20261113_fluxo_expedicao_f6_9_down.sql

-- 1) Campo que guarda o status antes do 1º bip
ALTER TABLE public.movimento_saida
  ADD COLUMN IF NOT EXISTS status_pre_carregamento public.enum_status_onda_carregamento;
COMMENT ON COLUMN public.movimento_saida.status_pre_carregamento IS
  'Status da onda imediatamente antes do 1º bip do embarque (CONFERIDO/SEPARADO). Usado para devolver a onda quando a carga é cancelada ou a onda é removida.';

-- 2) 1º bip guarda o status anterior (no mesmo UPDATE, o lado direito lê o valor antigo)
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.embarque_bipar_unidade'::regproc);
  n := replace(d, $a$UPDATE movimento_saida SET status = 'EM_CARREGAMENTO'
   WHERE id = v_un.movimento_saida_id AND status IN ('CONFERIDO','SEPARADO');$a$,
               $b$UPDATE movimento_saida SET status_pre_carregamento = status, status = 'EM_CARREGAMENTO'
   WHERE id = v_un.movimento_saida_id AND status IN ('CONFERIDO','SEPARADO');$b$);
  IF n = d THEN RAISE EXCEPTION 'F6.9: padrão do embarque_bipar_unidade não encontrado'; END IF;
  EXECUTE n;
END $$;

-- 3) Função que devolve a onda
CREATE OR REPLACE FUNCTION public._fn_carga_devolver_onda(p_carga_id uuid, p_movimento_saida_id uuid, p_motivo text, p_usuario_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_ms record; v_destino public.enum_status_onda_carregamento;
BEGIN
  SELECT ms.id, ms.tenant_id, ms.empresa_id, ms.numero_onda, ms.status, ms.status_pre_carregamento, ts.realiza_conferencia
    INTO v_ms
    FROM movimento_saida ms LEFT JOIN tipo_saida ts ON ts.id = ms.tipo_saida
   WHERE ms.id = p_movimento_saida_id FOR UPDATE OF ms;
  IF v_ms.id IS NULL OR v_ms.status <> 'EM_CARREGAMENTO' THEN RETURN NULL; END IF;
  -- Algum volume da onda continua embarcado numa carga não cancelada?
  IF EXISTS (SELECT 1 FROM carga_unidade cu JOIN carga c ON c.id = cu.carga_id
              WHERE cu.movimento_saida_id = p_movimento_saida_id AND cu.status = 'EMBARCADA' AND c.status <> 'CANCELADA') THEN
    RETURN NULL;
  END IF;
  -- Está em outra carga ativa?
  IF EXISTS (SELECT 1 FROM carga_documento cd JOIN carga c ON c.id = cd.carga_id
              WHERE cd.movimento_saida_id = p_movimento_saida_id AND cd.ativo
                AND c.status IN ('EM_MONTAGEM','LIBERADA','EM_CARREGAMENTO')) THEN
    RETURN NULL;
  END IF;

  v_destino := COALESCE(v_ms.status_pre_carregamento,
                        CASE WHEN COALESCE(v_ms.realiza_conferencia, true) THEN 'CONFERIDO' ELSE 'SEPARADO' END::public.enum_status_onda_carregamento);

  -- Marca local: retorno ao ERP e geração de conferência ignoram esta troca
  PERFORM set_config('logitrack.devolucao_carga', 'on', true);
  UPDATE movimento_saida SET status = v_destino, status_pre_carregamento = NULL WHERE id = p_movimento_saida_id;
  PERFORM set_config('logitrack.devolucao_carga', '', true);

  INSERT INTO carga_evento (tenant_id, empresa_id, carga_id, tipo, usuario_id, dados, created_by)
  VALUES (v_ms.tenant_id, v_ms.empresa_id, p_carga_id, 'ONDA_STATUS_DEVOLVIDO', p_usuario_id,
          jsonb_build_object('movimento_saida_id', p_movimento_saida_id, 'numero_onda', v_ms.numero_onda,
                             'de', 'EM_CARREGAMENTO', 'para', v_destino::text, 'motivo', p_motivo,
                             'status_guardado', v_ms.status_pre_carregamento IS NOT NULL),
          p_usuario_id);
  RETURN v_destino::text;
END $$;
REVOKE ALL ON FUNCTION public._fn_carga_devolver_onda(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;

-- 4) carga_cancelar devolve todas as ondas da carga
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.carga_cancelar'::regproc);
  n := replace(d, 'DECLARE v_u uuid; v_c record;', 'DECLARE v_u uuid; v_c record; v_ondas uuid[]; v_o uuid;');
  n := replace(n, $a$  PERFORM public._fn_carga_cancelar_unidades(p_carga_id, NULL, 'CARGA_CANCELADA');$a$,
                  $b$  SELECT array_agg(DISTINCT cd.movimento_saida_id) INTO v_ondas FROM carga_documento cd WHERE cd.carga_id = p_carga_id AND cd.ativo;
  PERFORM public._fn_carga_cancelar_unidades(p_carga_id, NULL, 'CARGA_CANCELADA');$b$);
  n := replace(n, $a$                   motivo_cancelamento = btrim(p_motivo), updated_by = v_u
   WHERE id = p_carga_id;$a$,
                  $b$                   motivo_cancelamento = btrim(p_motivo), updated_by = v_u
   WHERE id = p_carga_id;
  FOREACH v_o IN ARRAY COALESCE(v_ondas, '{}'::uuid[]) LOOP
    PERFORM public._fn_carga_devolver_onda(p_carga_id, v_o, 'CARGA_CANCELADA', v_u);
  END LOOP;$b$);
  IF n = d OR position('_fn_carga_devolver_onda' in n) = 0 OR position('v_ondas uuid[]' in n) = 0 OR position('array_agg(DISTINCT cd.movimento_saida_id)' in n) = 0 THEN
    RAISE EXCEPTION 'F6.9: padrões do carga_cancelar não encontrados';
  END IF;
  EXECUTE n;
END $$;

-- 5) carga_remover_onda devolve a onda removida
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.carga_remover_onda'::regproc);
  n := replace(d, $a$  PERFORM public._fn_carga_recalcular(p_carga_id);

  RETURN jsonb_build_object('sucesso', true, 'codigo', 'CARGA_ONDA_REMOVIDA'$a$,
                  $b$  PERFORM public._fn_carga_recalcular(p_carga_id);
  PERFORM public._fn_carga_devolver_onda(p_carga_id, p_movimento_saida_id, 'ONDA_REMOVIDA', v_u);

  RETURN jsonb_build_object('sucesso', true, 'codigo', 'CARGA_ONDA_REMOVIDA'$b$);
  IF n = d THEN RAISE EXCEPTION 'F6.9: padrão do carga_remover_onda não encontrado'; END IF;
  EXECUTE n;
END $$;

-- 6) Gatilhos ignoram a devolução
CREATE OR REPLACE FUNCTION public.tg_mov_saida_gerar_conferencia()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$begin
    -- F6.9: devolução de carga (EM_CARREGAMENTO -> SEPARADO) não gera nova conferência
    if coalesce(current_setting('logitrack.devolucao_carga', true), '') = 'on' then
        return new;
    end if;

    if new.status = 'SEPARADO'
       and old.status is distinct from new.status then

        perform fn_gerar_conferencia_saida(
            new.id,
            new.tenant_id
        );

    end if;

    return new;
end;$function$;

DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('integracao.trg_retorno_status'::regproc);
  n := replace(d, $a$BEGIN
  SELECT c.codigo, c.entidade INTO v_evento, v_entidade$a$,
                  $b$BEGIN
  -- F6.9: devolução de carga não reenvia retorno ao ERP
  IF COALESCE(current_setting('logitrack.devolucao_carga', true), '') = 'on' THEN RETURN NULL; END IF;
  SELECT c.codigo, c.entidade INTO v_evento, v_entidade$b$);
  IF n = d THEN RAISE EXCEPTION 'F6.9: padrão do integracao.trg_retorno_status não encontrado'; END IF;
  EXECUTE n;
END $$;
