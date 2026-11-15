DROP FUNCTION IF EXISTS public.carga_listar(uuid, uuid, text[], integer);
CREATE OR REPLACE FUNCTION public.carga_listar(p_tenant_id uuid, p_empresa_id uuid, p_status text[] DEFAULT NULL::text[],
                                               p_limite integer DEFAULT 100, p_nf text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- F6.12: p_nf filtra pelo número da NF-e (contém) e a lista devolve 'nfes'.
DECLARE v jsonb; v_nf text := NULLIF(btrim(p_nf), '');
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);
  SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'numero_carga')::bigint DESC), '[]'::jsonb) INTO v FROM (
    SELECT jsonb_build_object(
      'id', c.id, 'numero_carga', c.numero_carga, 'status', c.status, 'unidade_embarque', c.unidade_embarque,
      'prioridade', c.prioridade,
      'responsaveis', (SELECT COALESCE(jsonb_agg(jsonb_build_object('usuario_id', u.id, 'nome', u.nome) ORDER BY u.nome), '[]'::jsonb)
                         FROM carga_responsavel r JOIN usuario u ON u.id = r.usuario_id WHERE r.carga_id = c.id AND r.ativo),
      'modalidade', c.modalidade, 'transportadora', COALESCE(tp.nome_fantasia, tp.razaosocial),
      'veiculo', v.descricao, 'placa', COALESCE(c.placa, v.placa), 'box', b.descricao, 'motorista', c.motorista,
      'peso_total', c.peso_total, 'm3_total', c.m3_total,
      'ondas', (SELECT count(DISTINCT cd.movimento_saida_id) FROM carga_documento cd WHERE cd.carga_id = c.id AND cd.ativo),
      'documentos', (SELECT count(*) FROM carga_documento cd WHERE cd.carga_id = c.id AND cd.ativo),
      'unidades_total', (SELECT count(*) FROM carga_unidade cu WHERE cu.carga_id = c.id AND cu.status <> 'CANCELADA'),
      'unidades_embarcadas', (SELECT count(*) FROM carga_unidade cu WHERE cu.carga_id = c.id AND cu.status = 'EMBARCADA'),
      'nfes', COALESCE((SELECT jsonb_agg(DISTINCT nf.numero_nf)
                          FROM carga_documento cd JOIN documento_saida_nf nf ON nf.documento_saida_id = cd.documento_saida_id
                         WHERE cd.carga_id = c.id AND (cd.ativo OR c.status = 'CANCELADA')
                           AND nf.numero_nf IS NOT NULL AND nf.data_cancelamento IS NULL), '[]'::jsonb),
      'created_at', c.created_at, 'liberada_em', c.liberada_em, 'fechada_em', c.fechada_em) AS x
      FROM carga c
      LEFT JOIN veiculos v ON v.id = c.veiculo_id
      LEFT JOIN parceiro tp ON tp.id = c.transportadora_id
      LEFT JOIN box b ON b.id = c.box_id
     WHERE c.tenant_id = p_tenant_id AND c.empresa_id = p_empresa_id
       AND (p_status IS NULL OR c.status = ANY(p_status))
       AND (v_nf IS NULL OR EXISTS (
             SELECT 1 FROM carga_documento cd JOIN documento_saida_nf nf ON nf.documento_saida_id = cd.documento_saida_id
              WHERE cd.carga_id = c.id AND (cd.ativo OR c.status = 'CANCELADA')
                AND (nf.numero_nf ILIKE '%' || v_nf || '%' OR nf.chave_nfe = v_nf)))
     ORDER BY c.numero_carga DESC
     LIMIT LEAST(GREATEST(COALESCE(p_limite, 100), 1), 500)) s;
  RETURN jsonb_build_object('sucesso', true, 'codigo', 'CARGA_LISTA', 'dados', v);
END $function$;
REVOKE ALL ON FUNCTION public.carga_listar(uuid, uuid, text[], integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.carga_listar(uuid, uuid, text[], integer, text) TO authenticated, service_role;