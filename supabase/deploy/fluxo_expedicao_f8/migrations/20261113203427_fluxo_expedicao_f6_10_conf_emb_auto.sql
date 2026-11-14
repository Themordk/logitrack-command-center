-- Fluxo de Expedição · F6.10 — tipo de saída: mesmo operador conferir e embarcar + liberar embarque automático
-- 2026-11-13 (QA)

ALTER TABLE public.tipo_saida
  ADD COLUMN IF NOT EXISTS permite_mesmo_operador_conf_emb boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS libera_embarque_automatico boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.tipo_saida.permite_mesmo_operador_conf_emb IS
  'false = quem conferiu uma onda (tarefa SEP-CONF executada) não pode embarcar a carga que contém essa onda.';
COMMENT ON COLUMN public.tipo_saida.libera_embarque_automatico IS
  'true = o job das saídas libera para o coletor as cargas EM_MONTAGEM (todas as ondas deste tipo) que já têm veículo/transportadora.';

-- 1) Ondas da carga que o usuário conferiu, quando o tipo proíbe conferir e embarcar
CREATE OR REPLACE FUNCTION public._fn_carga_ondas_conferidas_por(p_carga_id uuid, p_usuario_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT string_agg(DISTINCT ms.numero_onda::text, ', ')
    FROM carga_documento cd
    JOIN movimento_saida ms ON ms.id = cd.movimento_saida_id
    JOIN tipo_saida ts ON ts.id = ms.tipo_saida AND NOT ts.permite_mesmo_operador_conf_emb
   WHERE cd.carga_id = p_carga_id AND cd.ativo
     AND EXISTS (SELECT 1 FROM movimento_saida_item msi
                   JOIN tarefa t ON t.id_documento_origem = msi.id
                   JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id AND tt.codigo = 'SEP-CONF'
                   JOIN tarefa_execucao te ON te.tarefa_id = t.id AND te.usuario_id = p_usuario_id
                  WHERE msi.movimento_saida_id = ms.id);
$$;
REVOKE ALL ON FUNCTION public._fn_carga_ondas_conferidas_por(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 2) Elegibilidade (diálogo de responsáveis)
CREATE OR REPLACE FUNCTION public._fn_carga_usuario_elegivel(p_carga_id uuid, p_usuario_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN u.id IS NULL OR NOT u.ativo THEN jsonb_build_object('elegivel', false, 'codigo', 'USUARIO_INATIVO', 'mensagem', 'Usuário inativo.')
    WHEN u.tenant_id <> c.tenant_id THEN jsonb_build_object('elegivel', false, 'codigo', 'USUARIO_OUTRO_TENANT', 'mensagem', 'Usuário de outro ambiente.')
    WHEN u.empresa_id IS NOT NULL AND u.empresa_id <> c.empresa_id
         AND NOT public.fn_usuario_tem_permissao(u.id, 'web.atividades.montagem-carga', 'UPDATE')
      THEN jsonb_build_object('elegivel', false, 'codigo', 'USUARIO_OUTRA_EMPRESA', 'mensagem', 'Usuário de outra empresa.')
    WHEN NOT public.fn_usuario_tem_permissao(u.id, 'coletor.embarque', 'EXECUTE')
      THEN jsonb_build_object('elegivel', false, 'codigo', 'USUARIO_SEM_PERMISSAO', 'mensagem', 'Sem permissão de embarque no coletor.')
    WHEN public._fn_carga_ondas_conferidas_por(c.id, u.id) IS NOT NULL
      THEN jsonb_build_object('elegivel', false, 'codigo', 'USUARIO_CONFERIU_ONDA',
             'mensagem', 'Conferiu a(s) onda(s) ' || public._fn_carga_ondas_conferidas_por(c.id, u.id) || ' e o tipo de saída não permite conferir e embarcar.')
    ELSE jsonb_build_object('elegivel', true, 'codigo', 'ELEGIVEL', 'mensagem', null) END
  FROM carga c LEFT JOIN usuario u ON u.id = p_usuario_id WHERE c.id = p_carga_id;
$function$;

-- 3) Coletor: barrado antes de reservar/agir
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public._fn_embarque_checar_responsavel'::regproc);
  n := replace(d, $a$DECLARE v_nomes text; v_num bigint; v_c record;
BEGIN
$a$, $b$DECLARE v_nomes text; v_num bigint; v_c record; v_conf text;
BEGIN
  v_conf := public._fn_carga_ondas_conferidas_por(p_carga_id, p_usuario_id);
  IF v_conf IS NOT NULL THEN
    RAISE EXCEPTION 'EMBARQUE_MESMO_CONFERENTE: você conferiu a(s) onda(s) % desta carga e o tipo de saída não permite o mesmo operador conferir e embarcar.', v_conf;
  END IF;
$b$);
  IF n = d THEN RAISE EXCEPTION 'F6.10: padrão do _fn_embarque_checar_responsavel não encontrado'; END IF;
  EXECUTE n;

  d := pg_get_functiondef('public.embarque_buscar_cargas'::regproc);
  n := replace(d, $a$            OR EXISTS (SELECT 1 FROM carga_responsavel r WHERE r.carga_id = c.id AND r.ativo AND r.usuario_id = v_u))) x;$a$,
                  $b$            OR EXISTS (SELECT 1 FROM carga_responsavel r WHERE r.carga_id = c.id AND r.ativo AND r.usuario_id = v_u))
       AND public._fn_carga_ondas_conferidas_por(c.id, v_u) IS NULL) x;$b$);
  IF n = d THEN RAISE EXCEPTION 'F6.10: padrão do embarque_buscar_cargas não encontrado'; END IF;
  EXECUTE n;
END $$;

-- 4) Liberação automática do embarque (chamada pelo cron das saídas)
CREATE OR REPLACE FUNCTION public._fn_cron_liberar_embarque(p_tenant_id uuid, p_usuario_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; v_res jsonb; v_lib integer := 0; v_pend jsonb := '[]'::jsonb; v_msg text;
BEGIN
  FOR r IN
    SELECT c.id, c.numero_carga, c.modalidade, c.veiculo_id, c.transportadora_id
      FROM carga c
     WHERE c.tenant_id = p_tenant_id AND c.status = 'EM_MONTAGEM'
       AND c.updated_at < now() - interval '2 minutes'
       AND EXISTS (SELECT 1 FROM carga_documento cd WHERE cd.carga_id = c.id AND cd.ativo)
       AND NOT EXISTS (SELECT 1 FROM carga_documento cd
                         JOIN movimento_saida ms ON ms.id = cd.movimento_saida_id
                         JOIN tipo_saida ts ON ts.id = ms.tipo_saida
                        WHERE cd.carga_id = c.id AND cd.ativo AND NOT ts.libera_embarque_automatico)
     ORDER BY c.numero_carga
  LOOP
    IF (r.modalidade = 'PROPRIA' AND r.veiculo_id IS NULL) OR (r.modalidade = 'TERCEIRO' AND r.transportadora_id IS NULL) THEN
      v_pend := v_pend || jsonb_build_object('numero_carga', r.numero_carga,
        'mensagem', CASE WHEN r.modalidade = 'TERCEIRO' THEN 'sem transportadora' ELSE 'sem veículo' END);
      CONTINUE;
    END IF;
    BEGIN
      v_res := public.carga_liberar(p_tenant_id, p_usuario_id, r.id);
    EXCEPTION WHEN OTHERS THEN
      v_res := jsonb_build_object('sucesso', false, 'mensagem', SQLERRM);
    END;
    IF COALESCE((v_res->>'sucesso')::boolean, false) THEN
      v_lib := v_lib + 1;
      INSERT INTO carga_evento (tenant_id, empresa_id, carga_id, tipo, usuario_id, dados, created_by)
      SELECT c.tenant_id, c.empresa_id, c.id, 'LIBERADA_AUTOMATICA', p_usuario_id,
             jsonb_build_object('origem', 'cron_liberar_separacao_automatica'), p_usuario_id
        FROM carga c WHERE c.id = r.id;
    ELSE
      v_pend := v_pend || jsonb_build_object('numero_carga', r.numero_carga, 'mensagem', v_res->>'mensagem');
    END IF;
  END LOOP;

  IF v_lib > 0 OR (jsonb_array_length(v_pend) > 0 AND NOT EXISTS (
       SELECT 1 FROM log_cron_execucao l WHERE l.tenant_id = p_tenant_id AND l.nome_cron = 'cron_liberar_embarque_automatico'
          AND l.executado_em > now() - interval '15 minutes')) THEN
    SELECT string_agg('#' || (p->>'numero_carga') || ' (' || COALESCE(p->>'mensagem', '?') || ')', '; ') INTO v_msg
      FROM jsonb_array_elements(v_pend) p;
    INSERT INTO log_cron_execucao (tenant_id, nome_cron, sucesso, resultado, erro)
    VALUES (p_tenant_id, 'cron_liberar_embarque_automatico', jsonb_array_length(v_pend) = 0,
            jsonb_build_object('liberadas', v_lib, 'pendentes', v_pend),
            CASE WHEN v_msg IS NULL THEN NULL ELSE left(jsonb_array_length(v_pend) || ' carga(s) aguardando: ' || v_msg, 2000) END);
  END IF;
  RETURN jsonb_build_object('liberadas', v_lib, 'pendentes', v_pend);
END $$;
REVOKE ALL ON FUNCTION public._fn_cron_liberar_embarque(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 5) Encaixe no job das saídas
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.cron_liberar_separacao_automatica'::regproc);
  n := replace(d, 'v_ok boolean; v_novidade boolean;', 'v_ok boolean; v_novidade boolean; v_tem_cargas boolean; v_emb jsonb;');
  n := replace(n, $a$      IF NOT v_tem_docs AND NOT v_tem_criadas THEN CONTINUE; END IF;$a$,
                  $b$      -- F6.10: cargas montadas aguardando liberação automática do embarque
      v_tem_cargas := EXISTS (SELECT 1 FROM public.carga c WHERE c.tenant_id = v_tenant.tenant_id AND c.status = 'EM_MONTAGEM'
                                AND EXISTS (SELECT 1 FROM public.carga_documento cd JOIN public.movimento_saida ms ON ms.id = cd.movimento_saida_id
                                              JOIN public.tipo_saida ts ON ts.id = ms.tipo_saida
                                             WHERE cd.carga_id = c.id AND cd.ativo AND ts.libera_embarque_automatico));
      IF NOT v_tem_docs AND NOT v_tem_criadas AND NOT v_tem_cargas THEN CONTINUE; END IF;$b$);
  n := replace(n, $a$      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth_user_id::text)::text, true);
$a$, $b$      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth_user_id::text)::text, true);
      IF v_tem_cargas THEN
        BEGIN
          v_emb := public._fn_cron_liberar_embarque(v_tenant.tenant_id, v_usuario_id);
        EXCEPTION WHEN OTHERS THEN
          INSERT INTO public.log_cron_execucao (tenant_id, nome_cron, sucesso, erro)
          VALUES (v_tenant.tenant_id, 'cron_liberar_embarque_automatico', false, SQLERRM);
        END;
      END IF;
      IF NOT v_tem_docs AND NOT v_tem_criadas THEN CONTINUE; END IF;
$b$);
  IF position('v_tem_cargas boolean' in n) = 0 OR position('NOT v_tem_cargas THEN CONTINUE' in n) = 0
     OR position('_fn_cron_liberar_embarque' in n) = 0 THEN
    RAISE EXCEPTION 'F6.10: padrões do cron_liberar_separacao_automatica não encontrados';
  END IF;
  EXECUTE n;
END $$;
