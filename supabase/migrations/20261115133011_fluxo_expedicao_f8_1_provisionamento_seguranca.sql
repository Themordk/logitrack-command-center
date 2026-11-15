-- 2026-11-14 · Fluxo de Expedição · F8.1 — achados dos testes de isolamento entre clientes
-- 1) Cliente novo (fn_provisionar_tenant_completo) nascia com o módulo antigo do Roteiro e sem
--    Fluxo de Expedição, Montagem de Carga e Embarque no coletor: lista de módulos corrigida
--    (as permissões saem da lista, então o ADMINISTRADOR passa a ter acesso).
-- 2) Cliente novo nascia sem configuração do N2 (todas as ondas num movimento só): passa a
--    nascer com "Movimento por Documento" em cada empresa, o mesmo padrão dos clientes atuais.
-- 3) Usuário logado conseguia gravar/apagar o roteiro direto na tabela, sem a checagem de
--    permissão da tela: gravação direta fechada (só leitura); a gravação segue por roteiro_saida_salvar.
-- 4) Funções auxiliares sem acesso de visitante (anon).
-- 5) Caminho de busca fixo em _fn_carga_erro e _fn_prioridade_ordem; gatilho tg_carga_documento_prioridade fora da API.
-- Down: restaurar fn_provisionar_tenant_completo de _bkp_f81_fn_provisionar_tenant_completo e
--       GRANT INSERT, UPDATE, DELETE nas três tabelas de roteiro para authenticated.

DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_provisionar_tenant_completo(uuid)'::regprocedure);
  EXECUTE replace(d, 'FUNCTION public.fn_provisionar_tenant_completo(', 'FUNCTION public._bkp_f81_fn_provisionar_tenant_completo(');
  REVOKE ALL ON FUNCTION public._bkp_f81_fn_provisionar_tenant_completo(uuid) FROM PUBLIC, anon, authenticated;

  n := replace(d, $a$    ARRAY['web.armazem.roteiro-separacao', 'Roteiro de Separação', 'WEB'],$a$,
                  $a$    ARRAY['web.config.fluxo-expedicao', 'Fluxo de Expedição', 'WEB'],$a$);
  n := replace(n, $a$    ARRAY['web.atividades.mov-saida', 'Ondas de Carregamento', 'WEB'],$a$,
                  $a$    ARRAY['web.atividades.mov-saida', 'Ondas de Carregamento', 'WEB'],
    ARRAY['web.atividades.montagem-carga', 'Montagem de Carga', 'WEB'],$a$);
  n := replace(n, $a$    ARRAY['coletor.conferencia', 'Conferência', 'COLETOR'],$a$,
                  $a$    ARRAY['coletor.conferencia', 'Conferência', 'COLETOR'],
    ARRAY['coletor.embarque', 'Embarque', 'COLETOR'],$a$);
  n := replace(n, $a$    v_cnt_agrupamento_conferencia := 1;
  END IF;$a$, $a$    v_cnt_agrupamento_conferencia := 1;
  END IF;

  -- F8.1 (2026-11-14): Fluxo de Expedição nasce com "Movimento por Documento" em cada empresa
  INSERT INTO public.roteiro_saida_criterio (tenant_id, empresa_id, nivel, criterio, sequencia)
  SELECT p_tenant_id, e.id, 'MOVIMENTO', 'DOCUMENTO', 1
    FROM public.empresa e
   WHERE e.tenant_id = p_tenant_id
     AND NOT EXISTS (SELECT 1 FROM public.roteiro_saida_criterio rc
                      WHERE rc.tenant_id = p_tenant_id AND rc.empresa_id = e.id AND rc.nivel = 'MOVIMENTO');$a$);

  IF position('web.armazem.roteiro-separacao' IN n) > 0
     OR position('web.config.fluxo-expedicao' IN n) = 0
     OR position('web.atividades.montagem-carga' IN n) = 0
     OR position('coletor.embarque' IN n) = 0
     OR position('F8.1 (2026-11-14)' IN n) = 0 THEN
    RAISE EXCEPTION 'F8.1: trechos de fn_provisionar_tenant_completo não encontrados';
  END IF;
  EXECUTE n;
END $$;

REVOKE INSERT, UPDATE, DELETE ON public.roteiro_saida_criterio, public.roteiro_saida_embarque, public.roteiro_saida_limite FROM authenticated;

REVOKE ALL ON FUNCTION public._fn_normalizar_marca(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._fn_grupo_sep_detalhe(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_roteiro_criterio_permitido(enum_nivel_roteiro_saida, enum_criterio_roteiro_saida) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._fn_normalizar_marca(text), public._fn_grupo_sep_detalhe(jsonb),
                          public.fn_roteiro_criterio_permitido(enum_nivel_roteiro_saida, enum_criterio_roteiro_saida)
      TO authenticated, service_role;

-- 5) Verificador de segurança do Supabase: caminho de busca fixo e função de gatilho fora da API
ALTER FUNCTION public._fn_carga_erro(text) SET search_path TO public;
ALTER FUNCTION public._fn_prioridade_ordem(enum_prioridade_onda) SET search_path TO public;
REVOKE ALL ON FUNCTION public.tg_carga_documento_prioridade() FROM PUBLIC, anon, authenticated;
