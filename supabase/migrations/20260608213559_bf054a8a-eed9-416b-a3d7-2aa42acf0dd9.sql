
DROP FUNCTION IF EXISTS public.rpc_historico_movimento_com_saldo(uuid, uuid, date, date, text, smallint);

CREATE OR REPLACE FUNCTION public.rpc_historico_movimento_com_saldo(
  p_tenant_id    uuid,
  p_empresa_id   uuid,
  p_data_inicio  date,
  p_data_fim     date,
  p_sku          text     DEFAULT NULL,
  p_tipo_mov     smallint DEFAULT NULL
)
RETURNS TABLE (
  id                     uuid,
  criado_em              timestamptz,
  tipo_movimento         smallint,
  quantidade             numeric,
  lote                   text,
  hu_id                  uuid,
  sku                    text,
  produto_descricao      text,
  endereco_origem        text,
  endereco_destino       text,
  usuario_nome           text,
  tipo_documento_origem  text,
  tipo_tarefa_codigo     text,
  tipo_tarefa_descricao  text,
  tarefa_execucao_id     uuid,
  tarefa_execucao_status text,
  saldo_inicial          numeric,
  saldo_final            numeric
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id obrigatório';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      em.id,
      em.criado_em,
      em.produto_id,
      em.tipo_movimento,
      em.quantidade,
      em.lote,
      em.hu_id,
      em.tarefa_execucao_id,
      p.sku,
      p.descricao AS produto_descricao,
      eo.descricao AS endereco_origem,
      ed.descricao AS endereco_destino,
      u.nome      AS usuario_nome,
      t.tipo_documento_origem,
      tt.codigo    AS tipo_tarefa_codigo,
      tt.descricao AS tipo_tarefa_descricao,
      te.status    AS tarefa_execucao_status,
      CASE
        WHEN em.tipo_movimento IN (1, 4, 99) THEN  em.quantidade
        WHEN em.tipo_movimento IN (2, 5)     THEN -em.quantidade
        ELSE 0
      END AS qtd_sinal
    FROM estoque_movimento em
    LEFT JOIN produto         p  ON p.id  = em.produto_id
    LEFT JOIN endereco        eo ON eo.id = em.endereco_origem_id
    LEFT JOIN endereco        ed ON ed.id = em.endereco_destino_id
    LEFT JOIN usuario         u  ON u.id  = em.usuario_id
    LEFT JOIN tarefa_execucao te ON te.id = em.tarefa_execucao_id
    LEFT JOIN tarefa          t  ON t.id  = te.tarefa_id
    LEFT JOIN tipo_tarefa     tt ON tt.id = t.tipo_tarefa_id
    WHERE em.tenant_id  = p_tenant_id
      AND (p_empresa_id IS NULL OR em.empresa_id = p_empresa_id)
      AND em.criado_em >= p_data_inicio::timestamptz
      AND em.criado_em <  (p_data_fim + INTERVAL '1 day')
      AND (p_sku       IS NULL OR p.sku = p_sku)
      AND (p_tipo_mov  IS NULL OR em.tipo_movimento = p_tipo_mov)
  ),
  com_saldo AS (
    SELECT
      b.*,
      COALESCE(
        SUM(b.qtd_sinal) OVER (
          PARTITION BY b.produto_id
          ORDER BY b.criado_em, b.id
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0
      ) AS saldo_inicial,
      SUM(b.qtd_sinal) OVER (
        PARTITION BY b.produto_id
        ORDER BY b.criado_em, b.id
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS saldo_final
    FROM base b
  )
  SELECT
    s.id, s.criado_em, s.tipo_movimento, s.quantidade, s.lote, s.hu_id,
    s.sku, s.produto_descricao, s.endereco_origem, s.endereco_destino,
    s.usuario_nome, s.tipo_documento_origem, s.tipo_tarefa_codigo,
    s.tipo_tarefa_descricao, s.tarefa_execucao_id, s.tarefa_execucao_status,
    s.saldo_inicial, s.saldo_final
  FROM com_saldo s
  ORDER BY s.criado_em DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_historico_movimento_com_saldo(uuid, uuid, date, date, text, smallint)
  TO authenticated, service_role;
