-- 2026-10-27: troca de endereço escolhida pelo operador no coletor (modal "Outros Endereços").
-- Antes o Confirmar só rebuscava as tarefas e o backend escolhia o destino sozinho.

-- Regra única de elegibilidade de endereço para uma tarefa SEP (usada pela listagem e pela troca)
CREATE OR REPLACE FUNCTION public.fn_separacao_endereco_elegivel(
  p_tenant_id uuid, p_tarefa_id uuid, p_endereco_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
-- Retorna NULL se elegível, ou o código do motivo da recusa.
DECLARE
  v_t   record;
  v_e   record;
  v_cfg record;
  v_separa_pulmao boolean := false;
  v_tem_picking   boolean;
BEGIN
  SELECT t.produto_id, t.empresa_id, t.armazem_id, COALESCE(p.usa_picking, false) AS usa_picking,
         msi.movimento_saida_id
    INTO v_t
  FROM tarefa t
  JOIN produto p ON p.id = t.produto_id
  LEFT JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem
  WHERE t.id = p_tarefa_id AND t.tenant_id = p_tenant_id;
  IF NOT FOUND THEN RETURN 'TAREFA_NAO_ENCONTRADA'; END IF;

  SELECT e.* INTO v_e FROM endereco e WHERE e.id = p_endereco_id AND e.tenant_id = p_tenant_id;
  IF NOT FOUND OR NOT v_e.ativo THEN RETURN 'ENDERECO_NAO_ENCONTRADO'; END IF;
  IF v_e.situacao IN ('BLOQUEADO', 'BLOQUEADO_INVENTARIO') THEN RETURN 'ENDERECO_BLOQUEADO'; END IF;
  IF v_t.armazem_id IS NOT NULL AND v_e.armazem_id <> v_t.armazem_id THEN RETURN 'ENDERECO_OUTRO_ARMAZEM'; END IF;

  SELECT ac.endereco_cancelamento_id, ac.endereco_avaria_id, ac.endereco_quarentena_id
    INTO v_cfg
  FROM armazem_config ac
  WHERE ac.tenant_id = p_tenant_id AND ac.empresa_id = v_t.empresa_id AND ac.ativo = true
  LIMIT 1;

  IF p_endereco_id IN (v_cfg.endereco_avaria_id, v_cfg.endereco_quarentena_id) THEN
    RETURN 'ENDERECO_SEGREGADO';
  END IF;
  IF p_endereco_id = v_cfg.endereco_cancelamento_id THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(ts.separa_pulmao, false) INTO v_separa_pulmao
  FROM movimento_saida ms LEFT JOIN tipo_saida ts ON ts.id = ms.tipo_saida
  WHERE ms.id = v_t.movimento_saida_id;

  IF NOT v_t.usa_picking THEN
    RETURN CASE WHEN v_e.tipo_endereco = 'PULMAO' THEN NULL ELSE 'ENDERECO_TIPO_NAO_PERMITIDO' END;
  END IF;

  IF v_e.tipo_endereco = 'PICKING' THEN RETURN NULL; END IF;

  IF v_e.tipo_endereco = 'PULMAO' AND COALESCE(v_separa_pulmao, false) THEN
    SELECT EXISTS (
      SELECT 1 FROM estoque_geral eg2 JOIN endereco e2 ON e2.id = eg2.endereco_id
      WHERE eg2.produto_id = v_t.produto_id AND eg2.tenant_id = p_tenant_id
        AND eg2.quantidade_disponivel > 0 AND e2.tipo_endereco = 'PICKING'
        AND e2.situacao NOT IN ('BLOQUEADO', 'BLOQUEADO_INVENTARIO')
        AND eg2.endereco_id IS DISTINCT FROM v_cfg.endereco_avaria_id
        AND eg2.endereco_id IS DISTINCT FROM v_cfg.endereco_quarentena_id)
      INTO v_tem_picking;
    RETURN CASE WHEN v_tem_picking THEN 'PICKING_COM_SALDO_DISPONIVEL' ELSE NULL END;
  END IF;

  RETURN 'ENDERECO_TIPO_NAO_PERMITIDO';
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_separacao_endereco_elegivel(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_separacao_endereco_elegivel(uuid, uuid, uuid) TO authenticated, service_role;


-- Lista para o modal: só endereços que a troca aceitaria
CREATE OR REPLACE FUNCTION public.separacao_listar_enderecos_alternativos(
  p_tenant_id uuid, p_tarefa_id uuid)
RETURNS TABLE(endereco_id uuid, endereco text, tipo_endereco text, saldo numeric,
              lote text, data_validade date, atende_total boolean, picking_mapeado boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_t record;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);

  SELECT t.produto_id, t.id_local_origem,
         t.quantidade_requerida - COALESCE(t.quantidade_executada, 0) AS pendente
    INTO v_t
  FROM tarefa t WHERE t.id = p_tarefa_id AND t.tenant_id = p_tenant_id;
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT e.id, e.descricao, e.tipo_endereco::text,
         SUM(eg.quantidade_disponivel)::numeric,
         CASE WHEN COUNT(DISTINCT eg.lote) = 1 THEN MIN(eg.lote)::text END,
         MIN(eg.data_validade)::date,
         SUM(eg.quantidade_disponivel) >= v_t.pendente,
         EXISTS (SELECT 1 FROM picking_produto pp WHERE pp.produto_id = v_t.produto_id
                   AND pp.endereco_id = e.id AND pp.ativo AND pp.tenant_id = p_tenant_id)
  FROM estoque_geral eg
  JOIN endereco e ON e.id = eg.endereco_id
  WHERE eg.produto_id = v_t.produto_id
    AND eg.tenant_id = p_tenant_id
    AND eg.quantidade_disponivel > 0
    AND eg.endereco_id IS DISTINCT FROM v_t.id_local_origem
    AND public.fn_separacao_endereco_elegivel(p_tenant_id, p_tarefa_id, e.id) IS NULL
  GROUP BY e.id, e.descricao, e.tipo_endereco
  ORDER BY SUM(eg.quantidade_disponivel) >= v_t.pendente DESC,
           MIN(eg.data_validade) ASC NULLS LAST, e.descricao;
END;
$function$;

REVOKE ALL ON FUNCTION public.separacao_listar_enderecos_alternativos(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.separacao_listar_enderecos_alternativos(uuid, uuid) TO authenticated, service_role;


-- Troca efetiva do endereço escolhido pelo operador
CREATE OR REPLACE FUNCTION public.separacao_trocar_endereco(
  p_tenant_id uuid, p_tarefa_id uuid, p_endereco_id uuid, p_usuario_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_t        record;
  v_e        record;
  v_motivo   text;
  v_saldo    numeric;
  v_pendente numeric;
  v_ordem    numeric;
  v_end_ant  text;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);

  IF p_tarefa_id IS NULL OR p_endereco_id IS NULL OR p_usuario_id IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'PARAMETROS_INVALIDOS',
                              'mensagem', 'Tarefa, endereço e usuário são obrigatórios.');
  END IF;

  SELECT t.id, t.status::text AS status, t.empresa_id, t.produto_id, t.id_local_origem,
         t.quantidade_requerida, COALESCE(t.quantidade_executada, 0) AS executada, tt.codigo
    INTO v_t
  FROM tarefa t
  JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id
  WHERE t.id = p_tarefa_id AND t.tenant_id = p_tenant_id
  FOR UPDATE OF t;

  IF NOT FOUND OR v_t.codigo <> 'SEP' THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'TAREFA_NAO_ENCONTRADA',
                              'mensagem', 'Tarefa de separação não encontrada.');
  END IF;

  IF v_t.status NOT IN ('CRIADA', 'ATRIBUIDA', 'EM_ANDAMENTO') THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'TAREFA_STATUS_INVALIDO',
                              'mensagem', 'Esta tarefa não pode mais ter o endereço alterado.',
                              'dados', jsonb_build_object('status', v_t.status));
  END IF;

  IF v_t.executada > 0 THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'TAREFA_PARCIALMENTE_SEPARADA',
                              'mensagem', 'Item já parcialmente separado. Finalize ou corte o restante antes de trocar o endereço.');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM tarefa_atribuicao ta
                 WHERE ta.tarefa_id = p_tarefa_id AND ta.usuario_id = p_usuario_id
                   AND ta.status = 'ATRIBUIDA' AND ta.tenant_id = p_tenant_id) THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'TAREFA_NAO_ATRIBUIDA_USUARIO',
                              'mensagem', 'Esta tarefa não está atribuída a você.');
  END IF;

  IF v_t.id_local_origem = p_endereco_id THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'ENDERECO_IGUAL',
                              'mensagem', 'A tarefa já está neste endereço.');
  END IF;

  v_motivo := public.fn_separacao_endereco_elegivel(p_tenant_id, p_tarefa_id, p_endereco_id);
  IF v_motivo IS NOT NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', v_motivo,
                              'mensagem', 'Endereço não permitido para esta separação.');
  END IF;

  SELECT e.id, e.descricao, e.rua, e.predio, e.nivel, e.apto, e.armazem_id
    INTO v_e FROM endereco e WHERE e.id = p_endereco_id;

  -- trava os saldos do destino para evitar duas trocas disputando o mesmo estoque
  PERFORM 1 FROM estoque_geral eg
   WHERE eg.produto_id = v_t.produto_id AND eg.endereco_id = p_endereco_id
     AND eg.tenant_id = p_tenant_id
   FOR UPDATE;

  SELECT COALESCE(SUM(eg.quantidade_disponivel), 0) INTO v_saldo
  FROM estoque_geral eg
  WHERE eg.produto_id = v_t.produto_id AND eg.endereco_id = p_endereco_id
    AND eg.tenant_id = p_tenant_id;

  v_pendente := v_t.quantidade_requerida - v_t.executada;
  IF v_saldo < v_pendente THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'SALDO_INSUFICIENTE',
                              'mensagem', 'Saldo do endereço não atende a quantidade da tarefa.',
                              'dados', jsonb_build_object('saldo', v_saldo, 'requerida', v_pendente));
  END IF;

  v_ordem := (
    COALESCE((SELECT oe.sequencia FROM ordem_expedicao oe
              WHERE oe.rua = v_e.rua AND oe.tenant_id = p_tenant_id
                AND oe.empresa_id = v_t.empresa_id
                AND (oe.armazem_id IS NULL OR oe.armazem_id = v_e.armazem_id)
              LIMIT 1), 999) * 1000000
    + COALESCE(v_e.predio, 0) * 10000
    + COALESCE(v_e.nivel, 0) * 100
    + COALESCE(v_e.apto, 0))::numeric;

  SELECT e.descricao INTO v_end_ant FROM endereco e WHERE e.id = v_t.id_local_origem;

  UPDATE tarefa
     SET id_local_origem  = p_endereco_id,
         ordem_tarefa     = v_ordem,
         motivo_pendencia = NULL,
         -- se o endereço antigo já tinha sido confirmado, exige nova confirmação no novo
         status           = CASE WHEN status = 'EM_ANDAMENTO' THEN 'ATRIBUIDA' ELSE status END
   WHERE id = p_tarefa_id AND tenant_id = p_tenant_id;

  INSERT INTO tarefa_evento_execucao (tenant_id, execucao_tarefa_id, tarefa_id, tipo_evento, carga_util)
  VALUES (p_tenant_id, NULL, p_tarefa_id, 'TROCA_ENDERECO',
          jsonb_build_object(
            'origem', 'COLETOR_OUTROS_ENDERECOS',
            'usuario_id', p_usuario_id,
            'endereco_anterior_id', v_t.id_local_origem,
            'endereco_anterior', v_end_ant,
            'endereco_novo_id', p_endereco_id,
            'endereco_novo', v_e.descricao,
            'saldo_destino', v_saldo,
            'quantidade_pendente', v_pendente,
            'status_anterior', v_t.status));

  RETURN jsonb_build_object('sucesso', true, 'codigo', 'ENDERECO_TROCADO',
                            'mensagem', 'Endereço alterado para ' || v_e.descricao || '.',
                            'dados', jsonb_build_object('endereco_id', p_endereco_id,
                                                        'endereco', v_e.descricao,
                                                        'saldo', v_saldo,
                                                        'ordem_tarefa', v_ordem));
END;
$function$;

REVOKE ALL ON FUNCTION public.separacao_trocar_endereco(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.separacao_trocar_endereco(uuid, uuid, uuid, uuid) TO authenticated, service_role;
