-- F6.6 · 2026-11-12: acompanhamento do carregamento (operadores, volumes com data/hora e eventos)
CREATE OR REPLACE FUNCTION public.carga_acompanhamento(p_tenant_id uuid, p_carga_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_c record; v jsonb;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);
  SELECT c.* INTO v_c FROM carga c WHERE c.id = p_carga_id AND c.tenant_id = p_tenant_id;
  IF v_c.id IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'CARGA_NAO_ENCONTRADA', 'mensagem', 'Carga não encontrada.');
  END IF;

  SELECT jsonb_build_object(
    'carga', jsonb_build_object('id', v_c.id, 'numero_carga', v_c.numero_carga, 'status', v_c.status,
       'modalidade', v_c.modalidade, 'unidade_embarque', v_c.unidade_embarque,
       'liberada_em', v_c.liberada_em, 'liberada_por_nome', (SELECT nome FROM usuario WHERE id = v_c.liberada_por),
       'iniciada_em', v_c.iniciada_em,
       'veiculo_confirmado_em', v_c.veiculo_confirmado_em, 'veiculo_confirmado_por_nome', (SELECT nome FROM usuario WHERE id = v_c.veiculo_confirmado_por),
       'fechada_em', v_c.fechada_em, 'fechada_por_nome', (SELECT nome FROM usuario WHERE id = v_c.fechada_por),
       'ultima_leitura_em', (SELECT max(embarcada_em) FROM carga_unidade WHERE carga_id = v_c.id AND status = 'EMBARCADA')),
    'totais', (SELECT jsonb_build_object(
         'total', count(*) FILTER (WHERE status <> 'CANCELADA'),
         'embarcados', count(*) FILTER (WHERE status = 'EMBARCADA'),
         'pendentes', count(*) FILTER (WHERE status = 'PENDENTE'),
         'pedidos_sem_volume', (SELECT count(*) FROM carga_documento cd WHERE cd.carga_id = v_c.id AND cd.ativo
                                  AND NOT EXISTS (SELECT 1 FROM carga_unidade x WHERE x.carga_documento_id = cd.id AND x.status <> 'CANCELADA')))
       FROM carga_unidade WHERE carga_id = v_c.id),
    'operadores', COALESCE((SELECT jsonb_agg(jsonb_build_object('usuario_id', o.uid, 'nome', o.nome, 'volumes', o.n,
                                 'primeira_leitura', o.ini, 'ultima_leitura', o.fim) ORDER BY o.ini)
       FROM (SELECT cu.embarcada_por AS uid, u.nome, count(*) AS n, min(cu.embarcada_em) AS ini, max(cu.embarcada_em) AS fim
               FROM carga_unidade cu LEFT JOIN usuario u ON u.id = cu.embarcada_por
              WHERE cu.carga_id = v_c.id AND cu.status = 'EMBARCADA' GROUP BY cu.embarcada_por, u.nome) o), '[]'::jsonb),
    'volumes', COALESCE((SELECT jsonb_agg(jsonb_build_object(
         'id', cu.id, 'codigo', cu.codigo, 'descricao', cu.descricao, 'tipo', cu.tipo, 'sequencia', cu.sequencia,
         'status', cu.status, 'embarcada_em', cu.embarcada_em, 'embarcada_por_nome', u.nome,
         'digitado', EXISTS (SELECT 1 FROM carga_evento ev WHERE ev.carga_id = v_c.id AND ev.tipo = 'VOLUME_DIGITADO'
                               AND ev.dados->>'carga_unidade_id' = cu.id::text),
         'numero_pedido', ds.numero_pedido, 'parceiro', COALESCE(p.nome_fantasia, p.razaosocial), 'cidade', p.cidade,
         'numero_onda', ms.numero_onda) ORDER BY cu.sequencia, cu.codigo)
       FROM carga_unidade cu
       JOIN movimento_saida ms ON ms.id = cu.movimento_saida_id
       LEFT JOIN usuario u ON u.id = cu.embarcada_por
       LEFT JOIN carga_documento cd ON cd.id = cu.carga_documento_id
       LEFT JOIN documento_saida ds ON ds.id = cd.documento_saida_id
       LEFT JOIN parceiro p ON p.id = ds.parceiro_id
      WHERE cu.carga_id = v_c.id AND cu.status <> 'CANCELADA'), '[]'::jsonb),
    'eventos', COALESCE((SELECT jsonb_agg(jsonb_build_object('tipo', ev.tipo, 'created_at', ev.created_at, 'usuario_nome', u.nome, 'dados', ev.dados)
                           ORDER BY ev.created_at DESC)
       FROM carga_evento ev LEFT JOIN usuario u ON u.id = ev.usuario_id WHERE ev.carga_id = v_c.id), '[]'::jsonb)
  ) INTO v;

  RETURN jsonb_build_object('sucesso', true, 'codigo', 'CARGA_ACOMPANHAMENTO', 'dados', v);
END $$;
REVOKE ALL ON FUNCTION public.carga_acompanhamento(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.carga_acompanhamento(uuid,uuid) TO authenticated, service_role;