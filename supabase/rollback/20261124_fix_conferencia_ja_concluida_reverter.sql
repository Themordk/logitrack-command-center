-- Reverte o fix de 24/11 (fn_gerar_conferencia_saida v7 → v6).
DO $rb$
DECLARE v_def text; v_ini int; v_fim int; v_novo text;
BEGIN
  v_def := pg_get_functiondef('public.fn_gerar_conferencia_saida(uuid,uuid)'::regprocedure);
  IF position('CONFERENCIA_JA_CONCLUIDA' in v_def) = 0 THEN RETURN; END IF;
  v_ini := position('    -- v7 (2026-11-24): nada novo' in v_def);
  v_fim := position($a$    RETURN jsonb_build_object('sucesso', true, 'codigo', 'JA_EXISTE',$a$ in v_def);
  IF v_ini = 0 OR v_fim <= v_ini THEN RAISE EXCEPTION 'reversão: trecho v7 não encontrado'; END IF;
  v_novo := substr(v_def, 1, v_ini - 1) || substr(v_def, v_fim);
  v_novo := replace(v_novo, '-- v7 (2026-11-24): encerra a conferência quando não há nada novo a conferir e nada aberto.
', '');
  IF position('CONFERENCIA_JA_CONCLUIDA' in v_novo) > 0 THEN RAISE EXCEPTION 'reversão incompleta'; END IF;
  EXECUTE v_novo;
END
$rb$;
