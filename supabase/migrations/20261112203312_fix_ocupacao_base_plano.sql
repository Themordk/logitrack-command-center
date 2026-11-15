-- =====================================================================
-- 2026-11-12 · Fix: Relatório de Ocupação dando statement timeout (57014)
--
-- fn_ocupacao_base era LANGUAGE sql com SET search_path (não é inlinada):
-- o Postgres usava plano genérico, sem conhecer tenant/armazém, e sob RLS
-- (tenant_id = get_current_tenant()) a consulta levava ~55 s para o usuário
-- logado (role authenticated, statement_timeout 8 s). Como superusuário (sem
-- RLS) levava 0,19 s, por isso passou no teste.
--
-- Agora é plpgsql com RETURN QUERY EXECUTE … USING: o plano é montado a cada
-- chamada com os valores reais (~0,1 s sob RLS). Mesma assinatura, mesmo
-- resultado; as RPCs rpc_relatorio_ocupacao_* não mudam.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_ocupacao_base(
  p_tenant_id     uuid,
  p_armazem_id    uuid,
  p_setor_id      uuid DEFAULT NULL,
  p_tipo_endereco text DEFAULT NULL
)
RETURNS TABLE(
  endereco_id         uuid,
  descricao           text,
  setor_id            uuid,
  tipo_endereco       text,
  situacao            text,
  rua                 integer,
  predio              integer,
  nivel               integer,
  apto                integer,
  capacidade          numeric,
  quantidade_total    numeric,
  skus_count          integer,
  ultima_atualizacao  timestamptz,
  status_ocupacao     text,
  percentual_ocupacao numeric,
  divergente          boolean
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
BEGIN
  -- SQL dinâmico de propósito: força plano com os valores reais (ver cabeçalho).
  RETURN QUERY EXECUTE $q$
    WITH ends AS MATERIALIZED (
      SELECT e.id, e.descricao, e.setor_id, e.tipo_endereco::text AS tipo, e.situacao::text AS sit,
             e.rua, e.predio, e.nivel, e.apto,
             NULLIF(e.capacidade_unidades, 0) AS cap
      FROM endereco e
      WHERE e.tenant_id  = $1
        AND e.armazem_id = $2
        AND e.ativo
        AND ($3::uuid IS NULL OR e.setor_id = $3)
        AND ($4::text IS NULL OR e.tipo_endereco::text = upper($4))
    ),
    est AS (
      SELECT eg.endereco_id, sum(eg.quantidade_total) AS qtd,
             count(DISTINCT eg.produto_id)::integer AS skus,
             max(eg.atualizado_em) AS ult
      FROM estoque_geral eg
      WHERE eg.tenant_id = $1
        AND eg.quantidade_total > 0
        AND eg.endereco_id IN (SELECT id FROM ends)
      GROUP BY eg.endereco_id
    )
    SELECT e.id, e.descricao, e.setor_id, e.tipo, e.sit,
           e.rua, e.predio, e.nivel, e.apto,
           e.cap,
           COALESCE(s.qtd, 0),
           COALESCE(s.skus, 0),
           s.ult,
           CASE WHEN e.sit IN ('BLOQUEADO', 'BLOQUEADO_INVENTARIO') THEN 'BLOQUEADO'
                WHEN COALESCE(s.qtd, 0) > 0 AND e.cap IS NOT NULL AND s.qtd < e.cap THEN 'PARCIAL'
                WHEN COALESCE(s.qtd, 0) > 0 THEN 'OCUPADO'
                ELSE 'LIVRE' END,
           CASE WHEN e.cap IS NOT NULL THEN round(COALESCE(s.qtd, 0) / e.cap * 100, 1) END,
           (e.sit = 'LIVRE' AND COALESCE(s.qtd, 0) > 0) OR (e.sit = 'OCUPADO' AND COALESCE(s.qtd, 0) = 0)
    FROM ends e
    LEFT JOIN est s ON s.endereco_id = e.id
  $q$ USING p_tenant_id, p_armazem_id, p_setor_id, p_tipo_endereco;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_ocupacao_base(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_ocupacao_base(uuid, uuid, uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
