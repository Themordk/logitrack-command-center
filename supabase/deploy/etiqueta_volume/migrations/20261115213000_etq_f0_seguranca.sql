-- Migration: 20261115213000_etq_f0_seguranca.sql
-- Plano: Etiqueta de Volume de Expedição — Fase 0 (Segurança)
-- Ações: A1 (V1), A2/A26 (V3/V10), A3 (V6/V7), A4 (V4), A25-banco (V9)
-- Risco: médio — muda permissões de funções chamadas pelo agente de impressão e
--        restringe edição de impressoras/agents a perfis com permissão.
-- Pré-requisito verificado: todos os print_agent ativos têm auth_user_id preenchido.
-- Rollback: ver bloco ROLLBACK no fim do arquivo.

-- ============================================================
-- A1 — fn_excluir_volume_expedicao: tenant, usuário da sessão, permissão,
--      bloqueio se o volume já está numa carga, erro interno não exposto.
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_excluir_volume_expedicao(
  p_volume_id uuid,
  p_usuario_id uuid,              -- mantido por compatibilidade; IGNORADO (usa a sessão)
  p_observacao text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := public.get_current_tenant();
  v_usuario uuid;
  v_vol RECORD;
  v_total_antes int;
  v_total_depois int;
  v_ocorr jsonb;
  v_armazem_id uuid;
  v_desc text;
BEGIN
  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'SEM_SESSAO',
      'mensagem', 'Sessão sem tenant válido.');
  END IF;

  SELECT u.id INTO v_usuario FROM public.usuario u WHERE u.auth_user_id = auth.uid() LIMIT 1;

  IF NOT public.fn_usuario_tem_permissao(v_usuario, 'web.atividades.volumes', 'DELETE') THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'SEM_PERMISSAO',
      'mensagem', 'Seu perfil não tem permissão para excluir volumes.');
  END IF;

  SELECT ve.*, ms.numero_onda
    INTO v_vol
  FROM public.volume_expedicao ve
  LEFT JOIN public.movimento_saida ms ON ms.id = ve.movimento_saida_id
  WHERE ve.id = p_volume_id
    AND ve.tenant_id = v_tenant
  FOR UPDATE OF ve;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'NAO_ENCONTRADO',
      'mensagem', 'Volume não encontrado.');
  END IF;

  IF v_vol.status <> 'ABERTO' THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'STATUS_INVALIDO',
      'mensagem', format('Somente volumes em status ABERTO podem ser excluídos (status atual: %s).', v_vol.status));
  END IF;

  IF EXISTS (SELECT 1 FROM public.carga_unidade cu
             WHERE cu.tenant_id = v_tenant AND cu.tipo = 'VOLUME'
               AND cu.referencia_id = p_volume_id AND cu.status <> 'CANCELADA') THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'VOLUME_EM_CARGA',
      'mensagem', 'O volume está numa carga. Remova-o da carga antes de excluir.');
  END IF;

  SELECT COUNT(*) INTO v_total_antes
  FROM public.volume_expedicao
  WHERE tenant_id = v_tenant AND movimento_saida_id = v_vol.movimento_saida_id;

  SELECT id INTO v_armazem_id FROM public.armazem
    WHERE tenant_id = v_vol.tenant_id AND empresa_id = v_vol.empresa_id
    ORDER BY created_at ASC NULLS LAST
    LIMIT 1;

  DELETE FROM public.volume_expedicao WHERE id = p_volume_id AND tenant_id = v_tenant;

  v_total_depois := v_total_antes - 1;

  v_desc := format(
    'Exclusão do volume %s (onda %s). Movimento tinha %s volume(s) antes da exclusão e passa a ter %s.',
    v_vol.codigo_volume, COALESCE(v_vol.numero_onda::text, '—'), v_total_antes, v_total_depois);
  IF p_observacao IS NOT NULL AND btrim(p_observacao) <> '' THEN
    v_desc := v_desc || ' | Observação: ' || p_observacao;
  END IF;

  v_ocorr := public.registrar_ocorrencia_operacional(
    p_tenant_id := v_vol.tenant_id,
    p_empresa_id := v_vol.empresa_id,
    p_armazem_id := v_armazem_id,
    p_tipo_ocorrencia := 'OUTROS',
    p_categoria := 'CORRETIVA',
    p_etapa_ocorrencia := 'EXPEDICAO',
    p_observacao := v_desc,
    p_documento_origem_id := v_vol.movimento_saida_id,
    p_tipo_documento_origem := 'MOVIMENTO_SAIDA',
    p_usuario_criador_id := v_usuario,
    p_usuario_causador_id := v_usuario,
    p_prioridade := 'MEDIA'
  );

  RETURN jsonb_build_object(
    'sucesso', true, 'codigo', 'VOLUME_EXCLUIDO',
    'mensagem', format('Volume %s excluído com sucesso.', v_vol.codigo_volume),
    'dados', jsonb_build_object('codigo_volume', v_vol.codigo_volume,
      'total_antes', v_total_antes, 'total_depois', v_total_depois, 'ocorrencia', v_ocorr));

EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'fn_excluir_volume_expedicao(%): % %', p_volume_id, SQLSTATE, SQLERRM;
  RETURN jsonb_build_object('sucesso', false, 'codigo', 'ERRO_INTERNO',
    'mensagem', 'Erro ao excluir volume. Tente novamente ou acione o suporte.');
END;
$$;

-- ============================================================
-- A2/A26 — Funções do agente de impressão: só o usuário do próprio agente.
-- Estratégia: o corpo original vira "_core" (sem permissão pública) e uma
-- função de mesmo nome valida auth.uid() = print_agent.auth_user_id.
-- ============================================================
CREATE OR REPLACE FUNCTION public._fn_agent_autorizado(p_agent_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.print_agent pa
    WHERE pa.id = p_agent_id AND pa.ativo = true AND pa.auth_user_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public._fn_agent_autorizado(uuid) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF to_regprocedure('public._buscar_jobs_pendentes_core(uuid,integer)') IS NULL THEN
    ALTER FUNCTION public.buscar_jobs_pendentes(uuid, integer) RENAME TO _buscar_jobs_pendentes_core;
  END IF;
  IF to_regprocedure('public._obter_config_impressao_core(uuid)') IS NULL THEN
    ALTER FUNCTION public.obter_config_impressao(uuid) RENAME TO _obter_config_impressao_core;
  END IF;
  IF to_regprocedure('public._registrar_heartbeat_agent_core(uuid,text,text,text,text,jsonb)') IS NULL THEN
    ALTER FUNCTION public.registrar_heartbeat_agent(uuid, text, text, text, text, jsonb) RENAME TO _registrar_heartbeat_agent_core;
  END IF;
  IF to_regprocedure('public._atualizar_status_job_core(uuid,text,text,text)') IS NULL THEN
    ALTER FUNCTION public.atualizar_status_job(uuid, text, text, text) RENAME TO _atualizar_status_job_core;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public._buscar_jobs_pendentes_core(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._obter_config_impressao_core(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._registrar_heartbeat_agent_core(uuid, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._atualizar_status_job_core(uuid, text, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.buscar_jobs_pendentes(p_agent_id uuid, p_limite integer DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._fn_agent_autorizado(p_agent_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agent não autorizado para esta sessão', 'codigo', 'AGENT_NAO_AUTORIZADO');
  END IF;
  RETURN public._buscar_jobs_pendentes_core(p_agent_id, p_limite);
END $$;

CREATE OR REPLACE FUNCTION public.obter_config_impressao(p_agent_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._fn_agent_autorizado(p_agent_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agent não autorizado para esta sessão', 'codigo', 'AGENT_NAO_AUTORIZADO');
  END IF;
  RETURN public._obter_config_impressao_core(p_agent_id);
END $$;

CREATE OR REPLACE FUNCTION public.registrar_heartbeat_agent(
  p_agent_id uuid, p_versao text DEFAULT NULL, p_hostname text DEFAULT NULL,
  p_sistema_operacional text DEFAULT NULL, p_ip_local text DEFAULT NULL, p_impressoras_status jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._fn_agent_autorizado(p_agent_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agent não autorizado para esta sessão', 'codigo', 'AGENT_NAO_AUTORIZADO');
  END IF;
  RETURN public._registrar_heartbeat_agent_core(p_agent_id, p_versao, p_hostname, p_sistema_operacional, p_ip_local, p_impressoras_status);
END $$;

-- atualizar_status_job: o job precisa estar numa impressora do agente da sessão.
CREATE OR REPLACE FUNCTION public.atualizar_status_job(
  p_job_id uuid, p_status text, p_comando_gerado text DEFAULT NULL, p_erro_mensagem text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.fila_impressao fi
      JOIN public.impressora i ON i.id = fi.impressora_id
      JOIN public.print_agent pa ON pa.id = i.agent_id
      WHERE fi.id = p_job_id AND pa.ativo AND pa.auth_user_id = auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Job não pertence ao agent desta sessão', 'codigo', 'AGENT_NAO_AUTORIZADO');
  END IF;
  RETURN public._atualizar_status_job_core(p_job_id, p_status, p_comando_gerado, p_erro_mensagem);
END $$;

REVOKE ALL ON FUNCTION public.buscar_jobs_pendentes(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.obter_config_impressao(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.registrar_heartbeat_agent(uuid, text, text, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.atualizar_status_job(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.atualizar_status_jobs_batch(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buscar_jobs_pendentes(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obter_config_impressao(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_heartbeat_agent(uuid, text, text, text, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.atualizar_status_job(uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.atualizar_status_jobs_batch(jsonb) TO authenticated, service_role;

-- ============================================================
-- A3 — Versões antigas de solicitar_impressao sem uso (nenhum chamador no
--      front nem no banco): sem permissão. Remoção definitiva em release futura.
-- ============================================================
REVOKE ALL ON FUNCTION public.solicitar_impressao_(uuid, text, jsonb, text, uuid, text, uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.solicitar_impressao__(uuid, text, jsonb, text, text, uuid, integer, integer, text, text, uuid) FROM PUBLIC, anon, authenticated;

-- A3/V7 — view só leitura
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.vw_volume_expedicao_lista FROM authenticated;

-- ============================================================
-- A4 — view com security_invoker versionada (produção já está assim; o
--      repositório recriava sem a opção).
-- ============================================================
ALTER VIEW public.vw_volume_expedicao_lista SET (security_invoker = true);

-- ============================================================
-- A25 (banco) — V9: nome_sistema nunca pode carregar caracteres de shell,
-- e só perfis com permissão em web.config.impressao editam impressoras/agents.
-- Valores atuais de produção conferidos: todos passam na regra.
-- ============================================================
ALTER TABLE public.impressora DROP CONSTRAINT IF EXISTS ck_impressora_nome_sistema_seguro;
ALTER TABLE public.impressora ADD CONSTRAINT ck_impressora_nome_sistema_seguro
  CHECK (nome_sistema IS NULL OR (length(nome_sistema) <= 200
         AND nome_sistema !~ '["''`$;&|<>%^!*?{}\[\]~\r\n\t]'));

CREATE OR REPLACE FUNCTION public._fn_pode_config_impressao(p_acao text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.fn_usuario_tem_permissao(
    (SELECT u.id FROM public.usuario u WHERE u.auth_user_id = auth.uid() LIMIT 1),
    'web.config.impressao', p_acao);
$$;
REVOKE ALL ON FUNCTION public._fn_pode_config_impressao(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._fn_pode_config_impressao(text) TO authenticated;

DROP POLICY IF EXISTS tenant_access_impressora ON public.impressora;
DROP POLICY IF EXISTS impressora_select ON public.impressora;
DROP POLICY IF EXISTS impressora_insert ON public.impressora;
DROP POLICY IF EXISTS impressora_update ON public.impressora;
DROP POLICY IF EXISTS impressora_delete ON public.impressora;
CREATE POLICY impressora_select ON public.impressora FOR SELECT
  USING (tenant_id = public.get_current_tenant());
CREATE POLICY impressora_insert ON public.impressora FOR INSERT
  WITH CHECK (tenant_id = public.get_current_tenant() AND public._fn_pode_config_impressao('CREATE'));
CREATE POLICY impressora_update ON public.impressora FOR UPDATE
  USING (tenant_id = public.get_current_tenant() AND public._fn_pode_config_impressao('UPDATE'))
  WITH CHECK (tenant_id = public.get_current_tenant() AND public._fn_pode_config_impressao('UPDATE'));
CREATE POLICY impressora_delete ON public.impressora FOR DELETE
  USING (tenant_id = public.get_current_tenant() AND public._fn_pode_config_impressao('DELETE'));

DROP POLICY IF EXISTS tenant_access_print_agent ON public.print_agent;
DROP POLICY IF EXISTS print_agent_select ON public.print_agent;
DROP POLICY IF EXISTS print_agent_insert ON public.print_agent;
DROP POLICY IF EXISTS print_agent_update ON public.print_agent;
DROP POLICY IF EXISTS print_agent_delete ON public.print_agent;
CREATE POLICY print_agent_select ON public.print_agent FOR SELECT
  USING (tenant_id = public.get_current_tenant());
CREATE POLICY print_agent_insert ON public.print_agent FOR INSERT
  WITH CHECK (tenant_id = public.get_current_tenant() AND public._fn_pode_config_impressao('CREATE'));
CREATE POLICY print_agent_update ON public.print_agent FOR UPDATE
  USING (tenant_id = public.get_current_tenant() AND public._fn_pode_config_impressao('UPDATE'))
  WITH CHECK (tenant_id = public.get_current_tenant() AND public._fn_pode_config_impressao('UPDATE'));
CREATE POLICY print_agent_delete ON public.print_agent FOR DELETE
  USING (tenant_id = public.get_current_tenant() AND public._fn_pode_config_impressao('DELETE'));

-- ========== ROLLBACK (manual) ==========
-- 1. Funções do agente:
--    DROP FUNCTION public.buscar_jobs_pendentes(uuid,integer);
--    ALTER FUNCTION public._buscar_jobs_pendentes_core(uuid,integer) RENAME TO buscar_jobs_pendentes;
--    (idem obter_config_impressao, registrar_heartbeat_agent, atualizar_status_job)
--    GRANT EXECUTE nas funções restauradas TO anon, authenticated, service_role;
-- 2. Impressora/print_agent: DROP das policies novas e
--    CREATE POLICY tenant_access_impressora ON public.impressora FOR ALL
--      USING (tenant_id = get_current_tenant()) WITH CHECK (tenant_id = get_current_tenant());
--    (idem tenant_access_print_agent); ALTER TABLE public.impressora DROP CONSTRAINT ck_impressora_nome_sistema_seguro;
-- 3. fn_excluir_volume_expedicao: reaplicar a definição da migration 20260717220155.
-- 4. GRANT EXECUTE nas versões antigas de solicitar_impressao, se necessário.
