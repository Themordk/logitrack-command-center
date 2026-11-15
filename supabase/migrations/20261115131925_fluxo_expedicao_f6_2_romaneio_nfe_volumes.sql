-- =====================================================================
-- Fluxo de Expedição — F6.2 Romaneio: NF-e e volumes por pedido · 2026-11-12
-- Volumes por pedido, nesta ordem:
--   1. volume_expedicao com documento_saida_id = pedido;
--   2. volume_expedicao da onda (sem pedido), quando a onda tem só esse pedido;
--   3. documento_saida_nf.qtd_volumes (NF-e não cancelada/inutilizada);
--   4. sem informação (null).
-- Onda com vários pedidos e volumes sem pedido: o total da onda vai em 'volumes_ondas'.
-- Reversão: reaplicar carga_romaneio da F6 e DROP de _fn_carga_doc_volumes / _fn_carga_doc_nfe.
-- =====================================================================
CREATE OR REPLACE FUNCTION public._fn_carga_doc_nfe(p_documento_saida_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT string_agg(nf.numero_nf || COALESCE('-' || NULLIF(nf.serie, ''), ''), ', ' ORDER BY nf.data_emissao NULLS LAST, nf.numero_nf)
    FROM documento_saida_nf nf
   WHERE nf.documento_saida_id = p_documento_saida_id
     AND COALESCE(nf.situacao, '') NOT IN ('CANCELADA','INUTILIZADA') AND nf.data_cancelamento IS NULL
     AND NULLIF(nf.numero_nf, '') IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public._fn_carga_doc_volumes(p_documento_saida_id uuid, p_movimento_saida_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v integer;
BEGIN
  SELECT count(*) INTO v FROM volume_expedicao ve WHERE ve.documento_saida_id = p_documento_saida_id;
  IF v > 0 THEN RETURN jsonb_build_object('volumes', v, 'origem', 'VOLUME_EXPEDICAO'); END IF;

  IF (SELECT count(*) FROM movimento_saida_documento msd WHERE msd.movimento_saida_id = p_movimento_saida_id) = 1 THEN
    SELECT count(*) INTO v FROM volume_expedicao ve WHERE ve.movimento_saida_id = p_movimento_saida_id AND ve.documento_saida_id IS NULL;
    IF v > 0 THEN RETURN jsonb_build_object('volumes', v, 'origem', 'VOLUME_EXPEDICAO'); END IF;
  END IF;

  SELECT sum(nf.qtd_volumes) INTO v FROM documento_saida_nf nf
   WHERE nf.documento_saida_id = p_documento_saida_id
     AND COALESCE(nf.situacao, '') NOT IN ('CANCELADA','INUTILIZADA') AND nf.data_cancelamento IS NULL;
  IF COALESCE(v, 0) > 0 THEN RETURN jsonb_build_object('volumes', v, 'origem', 'NFE'); END IF;

  RETURN jsonb_build_object('volumes', NULL, 'origem', NULL);
END $$;

CREATE OR REPLACE FUNCTION public.carga_romaneio(p_tenant_id uuid, p_carga_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v jsonb; v_det jsonb; v_docs jsonb; v_ondas jsonb; v_total integer;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);
  IF NOT EXISTS (SELECT 1 FROM carga c WHERE c.id = p_carga_id AND c.tenant_id = p_tenant_id) THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'CARGA_NAO_ENCONTRADA', 'mensagem', 'Carga não encontrada.');
  END IF;
  v_det := public._fn_carga_detalhe(p_carga_id);

  SELECT COALESCE(jsonb_agg(d.value || jsonb_build_object(
           'nfe', public._fn_carga_doc_nfe((d.value->>'documento_saida_id')::uuid),
           'volumes', vol->'volumes', 'volumes_origem', vol->'origem') ORDER BY d.ord), '[]'::jsonb)
    INTO v_docs
    FROM jsonb_array_elements(v_det->'documentos') WITH ORDINALITY d(value, ord)
    CROSS JOIN LATERAL (SELECT public._fn_carga_doc_volumes((d.value->>'documento_saida_id')::uuid,
                                                           (d.value->>'movimento_saida_id')::uuid) AS vol) x;

  -- ondas com vários pedidos cujos volumes não estão separados por pedido
  SELECT COALESCE(jsonb_agg(jsonb_build_object('movimento_saida_id', ms.id, 'numero_onda', ms.numero_onda, 'volumes', z.n) ORDER BY ms.numero_onda), '[]'::jsonb)
    INTO v_ondas
    FROM (SELECT ve.movimento_saida_id, count(*) AS n FROM volume_expedicao ve
           WHERE ve.documento_saida_id IS NULL
             AND ve.movimento_saida_id IN (SELECT cd.movimento_saida_id FROM carga_documento cd WHERE cd.carga_id = p_carga_id AND cd.ativo)
           GROUP BY ve.movimento_saida_id) z
    JOIN movimento_saida ms ON ms.id = z.movimento_saida_id
   WHERE (SELECT count(*) FROM movimento_saida_documento msd WHERE msd.movimento_saida_id = z.movimento_saida_id) > 1;

  -- total: pedidos com volume próprio + total das ondas compartilhadas (sem contar duas vezes)
  SELECT COALESCE(sum((x->>'volumes')::int) FILTER (
           WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_ondas) o WHERE o->>'movimento_saida_id' = x->>'movimento_saida_id')), 0)
         + COALESCE((SELECT sum((o->>'volumes')::int) FROM jsonb_array_elements(v_ondas) o), 0)
    INTO v_total FROM jsonb_array_elements(v_docs) x;

  SELECT jsonb_build_object(
    'empresa', jsonb_build_object('razaosocial', e.razaosocial, 'cnpj', e.cnpj, 'url_logo', e.url_logo),
    'carga', v_det || jsonb_build_object('documentos', v_docs),
    'volumes_total', v_total,
    'volumes_ondas', v_ondas,
    'operadores', COALESCE((SELECT jsonb_agg(DISTINCT u.nome) FROM carga_unidade cu JOIN usuario u ON u.id = cu.embarcada_por WHERE cu.carga_id = c.id), '[]'::jsonb),
    'emitido_em', now())
  INTO v
  FROM carga c JOIN empresa e ON e.id = c.empresa_id
  WHERE c.id = p_carga_id AND c.tenant_id = p_tenant_id;
  RETURN jsonb_build_object('sucesso', true, 'codigo', 'CARGA_ROMANEIO', 'dados', v);
END $$;

REVOKE ALL ON FUNCTION public._fn_carga_doc_nfe(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_carga_doc_volumes(uuid, uuid) FROM PUBLIC, anon, authenticated;
