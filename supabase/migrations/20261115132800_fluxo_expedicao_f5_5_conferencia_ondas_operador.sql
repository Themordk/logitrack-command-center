-- F5.5 (2026-11-14): lista de ondas da conferência mostra quem está com a onda (padrão da separação).
DROP FUNCTION IF EXISTS public.conferencia_buscar_ondas(uuid, uuid, uuid);
CREATE FUNCTION public.conferencia_buscar_ondas(p_tenant_id uuid, p_empresa_id uuid, p_usuario_id uuid)
 RETURNS TABLE(movimento_saida_id uuid, numero_onda bigint, pedidos text, tipo_venda text, prioridade text, status text,
               exibe_parceiro boolean, parceiro_nome text, exibe_vendedor boolean, vendedor_nome text,
               atribuida_ao_usuario boolean, operador_nome text, qtd_operadores integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
-- v2 (2026-11-14) F5.5: devolve atribuida_ao_usuario / operador_nome / qtd_operadores; as ondas do operador vêm primeiro.
DECLARE v_conf uuid;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);
  PERFORM public.assert_usuario_sessao(p_usuario_id);
  SELECT tt.id INTO v_conf FROM tipo_tarefa tt WHERE tt.tenant_id = p_tenant_id AND tt.codigo = 'SEP-CONF' LIMIT 1;

  RETURN QUERY
  WITH elegiveis AS (
    SELECT ms.id
    FROM movimento_saida ms
    WHERE ms.tenant_id = p_tenant_id
      AND ms.empresa_id = p_empresa_id
      AND ms.status IN ('SEPARADO', 'EM_CONFERENCIA')
      AND (public.fn_conferencia_validar_onda(p_tenant_id, p_empresa_id, p_usuario_id, ms.id) ->> 'permitido')::boolean
  ), ondas AS (
    SELECT
        ms.id,
        ms.numero_onda,
        string_agg(DISTINCT ds.numero_pedido::text, ', ') AS pedidos,
        string_agg(DISTINCT ts.descricao, ' / ')::text AS tipo_venda,
        ms.prioridade::text AS prioridade,
        ms.status::text AS status,
        COALESCE(bool_and(ts.exibe_parceiro_conferencia), false) AS exibe_parceiro,
        CASE WHEN COALESCE(bool_and(ts.exibe_parceiro_conferencia), false) THEN
                string_agg(DISTINCT COALESCE(NULLIF(trim(p.nome_fantasia), ''), p.razaosocial), ' / ')::text
             ELSE NULL END AS parceiro_nome,
        COALESCE(bool_and(ts.exibe_vendedor_conferencia), false) AS exibe_vendedor,
        CASE WHEN COALESCE(bool_and(ts.exibe_vendedor_conferencia), false) THEN
                string_agg(DISTINCT NULLIF(btrim(ds.vendedor), ''), ' / ')::text
             ELSE NULL END AS vendedor_nome
    FROM elegiveis el
    JOIN movimento_saida ms ON ms.id = el.id
    JOIN movimento_saida_documento msd ON msd.movimento_saida_id = ms.id
    JOIN documento_saida ds ON ds.id = msd.documento_saida_id
    JOIN tipo_saida ts ON ts.id = ds.tipo_pedido_id
    LEFT JOIN parceiro p ON p.id = ds.parceiro_id
    GROUP BY ms.id, ms.numero_onda, ms.prioridade, ms.status
  )
  SELECT o.id, o.numero_onda, o.pedidos, o.tipo_venda, o.prioridade, o.status,
         o.exibe_parceiro, o.parceiro_nome, o.exibe_vendedor, o.vendedor_nome,
         COALESCE(a.atribuida_ao_usuario, false), a.operador_nome, COALESCE(a.qtd_operadores, 0)
  FROM ondas o
  LEFT JOIN LATERAL (
      SELECT bool_or(ta.usuario_id = p_usuario_id) AS atribuida_ao_usuario,
             string_agg(DISTINCT u.nome, ' / ')    AS operador_nome,
             COUNT(DISTINCT ta.usuario_id)::int    AS qtd_operadores
      FROM movimento_saida_item msi
      JOIN tarefa t             ON t.id_documento_origem = msi.id AND t.tipo_tarefa_id = v_conf
                               AND t.status IN ('CRIADA','ATRIBUIDA','EM_ANDAMENTO','PAUSADA')
      JOIN tarefa_atribuicao ta ON ta.tarefa_id = t.id AND ta.liberado_em IS NULL
      JOIN usuario u            ON u.id = ta.usuario_id
      WHERE msi.movimento_saida_id = o.id
  ) a ON true
  ORDER BY COALESCE(a.atribuida_ao_usuario, false) DESC, o.prioridade DESC, o.numero_onda;
END;
$function$;
REVOKE ALL ON FUNCTION public.conferencia_buscar_ondas(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conferencia_buscar_ondas(uuid, uuid, uuid) TO authenticated, service_role;