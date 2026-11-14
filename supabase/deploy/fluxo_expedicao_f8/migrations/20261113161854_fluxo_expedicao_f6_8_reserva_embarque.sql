-- Fluxo de Expedição · F6.8 — Reserva de tarefas do embarque + lista de cargas do coletor
-- 2026-11-13 (QA)
-- 1) tipo_saida.reserva_embarque_carga: a carga inteira fica com o primeiro operador que agir nela.
-- 2) _fn_embarque_checar_responsavel passa a reservar automaticamente (VOLATILE, trava a carga).
-- 3) embarque_buscar_cargas devolve responsaveis, operadores e reserva_carga.

ALTER TABLE public.tipo_saida
  ADD COLUMN IF NOT EXISTS reserva_embarque_carga boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.tipo_saida.reserva_embarque_carga IS
  'Embarque: true = a carga inteira é reservada para o primeiro operador que iniciar (veículo, bip ou geração de volumes); false = vários operadores podem embarcar a mesma carga.';

CREATE OR REPLACE FUNCTION public._fn_carga_reserva_embarque(p_carga_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM carga_documento cd
      JOIN movimento_saida ms ON ms.id = cd.movimento_saida_id
      JOIN tipo_saida ts ON ts.id = ms.tipo_saida
     WHERE cd.carga_id = p_carga_id AND cd.ativo AND ts.reserva_embarque_carga);
$$;
REVOKE ALL ON FUNCTION public._fn_carga_reserva_embarque(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._fn_embarque_checar_responsavel(p_carga_id uuid, p_usuario_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_nomes text; v_num bigint; v_c record;
BEGIN
  IF EXISTS (SELECT 1 FROM carga_responsavel r WHERE r.carga_id = p_carga_id AND r.ativo AND r.usuario_id = p_usuario_id) THEN RETURN; END IF;

  IF NOT EXISTS (SELECT 1 FROM carga_responsavel r WHERE r.carga_id = p_carga_id AND r.ativo) THEN
    IF NOT public._fn_carga_reserva_embarque(p_carga_id) THEN RETURN; END IF;
    -- Reserva da carga inteira: trava a carga para dois operadores não reservarem ao mesmo tempo
    SELECT c.id, c.tenant_id, c.empresa_id INTO v_c FROM carga c WHERE c.id = p_carga_id FOR UPDATE;
    IF NOT EXISTS (SELECT 1 FROM carga_responsavel r WHERE r.carga_id = p_carga_id AND r.ativo) THEN
      INSERT INTO carga_responsavel (tenant_id, empresa_id, carga_id, usuario_id, ativo, created_by)
      VALUES (v_c.tenant_id, v_c.empresa_id, p_carga_id, p_usuario_id, true, p_usuario_id);
      INSERT INTO carga_evento (tenant_id, empresa_id, carga_id, tipo, usuario_id, dados, created_by)
      VALUES (v_c.tenant_id, v_c.empresa_id, p_carga_id, 'RESERVA_EMBARQUE', p_usuario_id,
              jsonb_build_object('origem', 'tipo_saida.reserva_embarque_carga'), p_usuario_id);
      RETURN;
    END IF;
    IF EXISTS (SELECT 1 FROM carga_responsavel r WHERE r.carga_id = p_carga_id AND r.ativo AND r.usuario_id = p_usuario_id) THEN RETURN; END IF;
  END IF;

  SELECT c.numero_carga, (SELECT string_agg(u.nome, ', ' ORDER BY u.nome) FROM carga_responsavel r JOIN usuario u ON u.id = r.usuario_id
                           WHERE r.carga_id = c.id AND r.ativo)
    INTO v_num, v_nomes FROM carga c WHERE c.id = p_carga_id;
  RAISE EXCEPTION 'EMBARQUE_NAO_CONVOCADO: a carga #% está reservada para %.', v_num, v_nomes;
END $function$;
REVOKE ALL ON FUNCTION public._fn_embarque_checar_responsavel(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.embarque_buscar_cargas(p_tenant_id uuid, p_empresa_id uuid, p_usuario_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v jsonb; v_u uuid;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);
  PERFORM public.assert_usuario_sessao(p_usuario_id);
  v_u := public._fn_gestor_sessao(p_usuario_id, p_tenant_id);
  SELECT COALESCE(jsonb_agg(x.obj ORDER BY x.st, x.pr, x.num), '[]'::jsonb) INTO v FROM (
    SELECT CASE c.status WHEN 'EM_CARREGAMENTO' THEN 1 ELSE 2 END AS st, public._fn_prioridade_ordem(c.prioridade) AS pr, c.numero_carga AS num,
      jsonb_build_object(
      'id', c.id, 'numero_carga', c.numero_carga, 'status', c.status, 'unidade_embarque', c.unidade_embarque,
      'prioridade', c.prioridade,
      'convocado', EXISTS (SELECT 1 FROM carga_responsavel r WHERE r.carga_id = c.id AND r.ativo AND r.usuario_id = v_u),
      'reserva_carga', public._fn_carga_reserva_embarque(c.id),
      'responsaveis', COALESCE((SELECT jsonb_agg(u.nome ORDER BY u.nome) FROM carga_responsavel r JOIN usuario u ON u.id = r.usuario_id
                                 WHERE r.carga_id = c.id AND r.ativo), '[]'::jsonb),
      'operadores', COALESCE((SELECT jsonb_agg(DISTINCT u.nome) FROM carga_unidade cu JOIN usuario u ON u.id = cu.embarcada_por
                               WHERE cu.carga_id = c.id AND cu.status = 'EMBARCADA'), '[]'::jsonb),
      'modalidade', c.modalidade, 'transportadora', COALESCE(tp.nome_fantasia, tp.razaosocial),
      'veiculo', v.descricao, 'placa', COALESCE(c.placa, v.placa), 'box', b.descricao, 'motorista', c.motorista,
      'documentos', (SELECT count(*) FROM carga_documento cd WHERE cd.carga_id = c.id AND cd.ativo),
      'unidades_total', (SELECT count(*) FROM carga_unidade cu WHERE cu.carga_id = c.id AND cu.status <> 'CANCELADA'),
      'unidades_embarcadas', (SELECT count(*) FROM carga_unidade cu WHERE cu.carga_id = c.id AND cu.status = 'EMBARCADA')) AS obj
      FROM carga c
      LEFT JOIN veiculos v ON v.id = c.veiculo_id
      LEFT JOIN parceiro tp ON tp.id = c.transportadora_id
      LEFT JOIN box b ON b.id = c.box_id
     WHERE c.tenant_id = p_tenant_id AND c.empresa_id = p_empresa_id AND c.status IN ('LIBERADA','EM_CARREGAMENTO')
       AND (NOT EXISTS (SELECT 1 FROM carga_responsavel r WHERE r.carga_id = c.id AND r.ativo)
            OR EXISTS (SELECT 1 FROM carga_responsavel r WHERE r.carga_id = c.id AND r.ativo AND r.usuario_id = v_u))) x;
  RETURN jsonb_build_object('sucesso', true, 'codigo', 'EMBARQUE_CARGAS', 'dados', v);
END $function$;
