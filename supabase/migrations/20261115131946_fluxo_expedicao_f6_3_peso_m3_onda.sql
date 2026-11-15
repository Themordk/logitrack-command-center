-- =====================================================================
-- Fluxo de Expedição — F6.3 Peso e m³ da onda calculados do cadastro · 2026-11-12
-- movimento_saida.peso_total / m3 nunca são preenchidos (0 de 2.816 ondas em produção).
-- Peso/m³ passam a ser calculados na hora a partir dos itens da onda:
--   quantidade = conferida (>0) -> separada -> esperada - cortada
--   peso unitário = embalagem ativa de menor fator com peso (peso_bruto / fator) -> produto.peso_bruto
--   m³ unitário  = embalagem ativa de menor fator com m3 (m3 / fator)
-- Usado na sugestão (grid de ondas), no detalhe e nos totais da carga.
-- Reversão: reaplicar carga_sugerir/_fn_carga_detalhe/_fn_carga_recalcular da F6.1 e DROP _fn_onda_peso_m3.
-- =====================================================================
CREATE OR REPLACE FUNCTION public._fn_onda_peso_m3(p_movimento_saida_id uuid)
RETURNS TABLE(peso numeric, m3 numeric) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(round(sum(q.qtd * COALESCE(pp.peso_un, p.peso_bruto, 0)), 3), 0),
         COALESCE(round(sum(q.qtd * COALESCE(pm.m3_un, 0)), 4), 0)
    FROM movimento_saida_item i
    JOIN produto p ON p.id = i.produto_id
    CROSS JOIN LATERAL (SELECT GREATEST(COALESCE(NULLIF(i.qtd_conferida, 0), i.qtd_separada,
                                                 i.qtd_esperada - COALESCE(i.qtde_cortada, 0)), 0) AS qtd) q
    LEFT JOIN LATERAL (SELECT pe.peso_bruto / NULLIF(pe.fator, 0) AS peso_un FROM produto_embalagem pe
                        WHERE pe.produto_id = i.produto_id AND COALESCE(pe.ativo, true) AND pe.peso_bruto > 0 AND pe.fator > 0
                        ORDER BY pe.fator LIMIT 1) pp ON true
    LEFT JOIN LATERAL (SELECT pe.m3 / NULLIF(pe.fator, 0) AS m3_un FROM produto_embalagem pe
                        WHERE pe.produto_id = i.produto_id AND COALESCE(pe.ativo, true) AND pe.m3 > 0 AND pe.fator > 0
                        ORDER BY pe.fator LIMIT 1) pm ON true
   WHERE i.movimento_saida_id = p_movimento_saida_id;
$$;
REVOKE ALL ON FUNCTION public._fn_onda_peso_m3(uuid) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE d text; n text;
BEGIN
  -- sugestão
  d := pg_get_functiondef('public.carga_sugerir(uuid,uuid)'::regprocedure);
  n := replace(d, 'e.rota_id, e.peso_total, e.m3,', 'e.rota_id, pm.peso AS peso_total, pm.m3 AS m3,');
  n := replace(n, '      FROM elegiveis e
      LEFT JOIN veiculos v', '      FROM elegiveis e
      CROSS JOIN LATERAL public._fn_onda_peso_m3(e.id) pm
      LEFT JOIN veiculos v');
  IF n = d OR position('_fn_onda_peso_m3(e.id)' IN n) = 0 OR position('pm.peso AS peso_total' IN n) = 0 THEN RAISE EXCEPTION 'carga_sugerir: padrão não encontrado'; END IF;
  EXECUTE n;

  -- recálculo da carga
  d := pg_get_functiondef('public._fn_carga_recalcular(uuid)'::regprocedure);
  n := replace(d, '(SELECT sum(ms.peso_total) FROM movimento_saida ms WHERE ms.id = ANY(v_ondas))',
                  '(SELECT sum(pm.peso) FROM unnest(v_ondas) o(id) CROSS JOIN LATERAL public._fn_onda_peso_m3(o.id) pm)');
  n := replace(n, '(SELECT sum(ms.m3) FROM movimento_saida ms WHERE ms.id = ANY(v_ondas))',
                  '(SELECT sum(pm.m3) FROM unnest(v_ondas) o(id) CROSS JOIN LATERAL public._fn_onda_peso_m3(o.id) pm)');
  IF (length(n) - length(replace(n, '_fn_onda_peso_m3', ''))) / length('_fn_onda_peso_m3') <> 2 THEN RAISE EXCEPTION '_fn_carga_recalcular: padrão não encontrado'; END IF;
  EXECUTE n;

  -- detalhe (lista de ondas da carga)
  d := pg_get_functiondef('public._fn_carga_detalhe(uuid)'::regprocedure);
  n := replace(d, '''status'', ms.status, ''peso_total'', ms.peso_total, ''m3'', ms.m3,', '''status'', ms.status, ''peso_total'', pm.peso, ''m3'', pm.m3,');
  n := replace(n, '                FROM movimento_saida ms
               WHERE ms.id IN (SELECT cd.movimento_saida_id', '                FROM movimento_saida ms CROSS JOIN LATERAL public._fn_onda_peso_m3(ms.id) pm
               WHERE ms.id IN (SELECT cd.movimento_saida_id');
  IF position('pm.peso' IN n) = 0 OR position('_fn_onda_peso_m3(ms.id)' IN n) = 0 THEN RAISE EXCEPTION '_fn_carga_detalhe: padrão não encontrado'; END IF;
  EXECUTE n;
END $$;

-- cargas abertas passam a refletir o peso/m³ do cadastro
SELECT public._fn_carga_recalcular(c.id) FROM carga c WHERE c.status IN ('EM_MONTAGEM','LIBERADA','EM_CARREGAMENTO');
