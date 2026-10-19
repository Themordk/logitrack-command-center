-- =====================================================================
-- 2026-10-19 · Tipo de Saída · o que o coletor mostra na lista de ondas
--
-- Configuração por tipo de saída (4 chaves):
--                         Separação                    Conferência
--   Parceiro   exibe_parceiro_separacao (já existe)  exibe_parceiro_conferencia (nova)
--   Vendedor   exibe_vendedor_separacao (nova)       exibe_vendedor_conferencia (nova)
--
-- Defaults preservam o comportamento atual:
--   - parceiro na separação continua como está (default true, já existente);
--   - parceiro e vendedor na conferência e vendedor na separação começam
--     DESLIGADOS (hoje não são exibidos).
--
-- Regra (mesma já usada na separação): a informação só é exibida se TODOS os
-- documentos da onda forem de tipos que permitem; quando não permitido, o
-- nome NEM SAI do banco (não chega ao coletor nem ao cache offline).
--
-- Funções alteradas (RETURNS TABLE muda -> DROP + CREATE, mesmos parâmetros;
-- o coletor atual continua funcionando e ignora as colunas novas):
--   separacao_buscar_ondas   + exibe_vendedor, vendedor_nome
--   conferencia_buscar_ondas + exibe_parceiro, parceiro_nome,
--                              exibe_vendedor, vendedor_nome
--                              + assert_tenant_access
-- =====================================================================

-- 1. Configuração -----------------------------------------------------
ALTER TABLE public.tipo_saida
  ADD COLUMN IF NOT EXISTS exibe_vendedor_separacao   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exibe_parceiro_conferencia boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exibe_vendedor_conferencia boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tipo_saida.exibe_parceiro_separacao   IS 'Coletor: mostra o parceiro na lista de ondas da separação';
COMMENT ON COLUMN public.tipo_saida.exibe_vendedor_separacao   IS 'Coletor: mostra o vendedor na lista de ondas da separação';
COMMENT ON COLUMN public.tipo_saida.exibe_parceiro_conferencia IS 'Coletor: mostra o parceiro na lista de ondas da conferência';
COMMENT ON COLUMN public.tipo_saida.exibe_vendedor_conferencia IS 'Coletor: mostra o vendedor na lista de ondas da conferência';

-- 2. Backups ----------------------------------------------------------
INSERT INTO integracao.bkp_funcao_definicao (id, funcao, definicao, motivo, criado_em)
SELECT gen_random_uuid(), f, pg_get_functiondef(f::regprocedure),
       'Antes de 20261019160000_tipo_saida_exibicao_parceiro_vendedor', now()
FROM unnest(ARRAY['public.separacao_buscar_ondas(uuid,uuid,uuid)',
                  'public.conferencia_buscar_ondas(uuid,uuid,uuid)']) AS f;

-- 3. Separação --------------------------------------------------------
DROP FUNCTION public.separacao_buscar_ondas(uuid, uuid, uuid);

CREATE FUNCTION public.separacao_buscar_ondas(p_tenant_id uuid, p_empresa_id uuid, p_usuario_id uuid)
RETURNS TABLE(
  movimento_saida_id uuid, numero_onda bigint, pedidos text, tipo_venda text,
  prioridade text, status text, exibe_parceiro boolean, parceiro_nome text,
  atribuida_ao_usuario boolean, operador_nome text, qtd_operadores integer,
  exibe_vendedor boolean, vendedor_nome text
)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
    v_zona_usuario uuid;
BEGIN
    PERFORM public.assert_tenant_access(p_tenant_id);

    SELECT u.zona_atividade_separacao
    INTO v_zona_usuario
    FROM usuario u
    WHERE u.id = p_usuario_id AND u.tenant_id = p_tenant_id;

    RETURN QUERY
    WITH ondas AS (
      SELECT
          ms.id,
          ms.numero_onda,
          string_agg(DISTINCT ds.numero_pedido::text, ', ') AS pedidos,
          ts.descricao AS tipo_venda,
          ms.prioridade::text AS prioridade,
          ms.status::text AS status,
          COALESCE(bool_and(ts.exibe_parceiro_separacao), true) AS exibe_parceiro,
          CASE
              WHEN COALESCE(bool_and(ts.exibe_parceiro_separacao), true) THEN
                  string_agg(DISTINCT COALESCE(NULLIF(trim(p.nome_fantasia), ''), p.razaosocial), ' / ')::text
              ELSE NULL
          END AS parceiro_nome,
          COALESCE(bool_and(ts.exibe_vendedor_separacao), false) AS exibe_vendedor,
          CASE
              WHEN COALESCE(bool_and(ts.exibe_vendedor_separacao), false) THEN
                  string_agg(DISTINCT NULLIF(btrim(ds.vendedor), ''), ' / ')::text
              ELSE NULL
          END AS vendedor_nome
      FROM movimento_saida ms
      JOIN movimento_saida_documento msd ON msd.movimento_saida_id = ms.id
      JOIN documento_saida ds ON ds.id = msd.documento_saida_id
      JOIN tipo_saida ts ON ts.id = ds.tipo_pedido_id
      LEFT JOIN parceiro p ON p.id = ds.parceiro_id
      LEFT JOIN tipo_saida ts_mov ON ts_mov.id = ms.tipo_saida
      WHERE
          ms.tenant_id = p_tenant_id
          AND ms.empresa_id = p_empresa_id
          AND ms.status IN ('LIBERADO', 'EM_PICKING')
          AND (
              CASE
                  WHEN COALESCE(ts_mov.reserva_separacao_movimento, true) THEN
                      NOT EXISTS (
                          SELECT 1
                          FROM movimento_saida_item msi
                          JOIN tarefa t ON t.id_documento_origem = msi.id
                          JOIN tarefa_atribuicao ta
                              ON ta.tarefa_id = t.id AND ta.status = 'ATRIBUIDA'
                          WHERE msi.movimento_saida_id = ms.id
                            AND ta.usuario_id <> p_usuario_id
                      )
                  ELSE
                      EXISTS (
                          SELECT 1
                          FROM movimento_saida_item msi
                          JOIN tarefa t ON t.id_documento_origem = msi.id
                          JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id
                          WHERE msi.movimento_saida_id = ms.id
                            AND tt.codigo = 'SEP'
                            AND t.quantidade_requerida > COALESCE(t.quantidade_executada, 0)
                            AND (
                                t.status = 'CRIADA'
                                OR (
                                    t.status IN ('ATRIBUIDA', 'EM_ANDAMENTO')
                                    AND EXISTS (
                                        SELECT 1 FROM tarefa_atribuicao ta
                                        WHERE ta.tarefa_id = t.id
                                          AND ta.usuario_id = p_usuario_id
                                          AND ta.status = 'ATRIBUIDA'
                                    )
                                )
                            )
                      )
              END
          )
          AND (
              v_zona_usuario IS NULL
              OR EXISTS (
                  SELECT 1
                  FROM movimento_saida_item msi2
                  JOIN tarefa t2 ON t2.id_documento_origem = msi2.id
                  JOIN tipo_tarefa tt2 ON tt2.id = t2.tipo_tarefa_id
                  JOIN endereco_zona_atividade eza
                      ON eza.endereco_id = t2.id_local_origem
                     AND eza.tenant_id = p_tenant_id
                  WHERE msi2.movimento_saida_id = ms.id
                    AND tt2.codigo = 'SEP'
                    AND t2.status IN ('CRIADA', 'ATRIBUIDA', 'EM_ANDAMENTO')
                    AND eza.zona_atividade_id = v_zona_usuario
              )
          )
      GROUP BY
          ms.id, ms.numero_onda, ts.descricao, ms.prioridade, ms.status
    )
    SELECT
        o.id, o.numero_onda, o.pedidos, o.tipo_venda, o.prioridade, o.status,
        o.exibe_parceiro, o.parceiro_nome,
        COALESCE(a.atribuida_ao_usuario, false),
        a.operador_nome,
        COALESCE(a.qtd_operadores, 0),
        o.exibe_vendedor, o.vendedor_nome
    FROM ondas o
    LEFT JOIN LATERAL (
        SELECT
            bool_or(ta.usuario_id = p_usuario_id) AS atribuida_ao_usuario,
            string_agg(DISTINCT u.nome, ' / ')    AS operador_nome,
            COUNT(DISTINCT ta.usuario_id)::int    AS qtd_operadores
        FROM movimento_saida_item msi
        JOIN tarefa t            ON t.id_documento_origem = msi.id
        JOIN tipo_tarefa tt      ON tt.id = t.tipo_tarefa_id AND tt.codigo = 'SEP'
        JOIN tarefa_atribuicao ta ON ta.tarefa_id = t.id AND ta.status = 'ATRIBUIDA'
        JOIN usuario u           ON u.id = ta.usuario_id
        WHERE msi.movimento_saida_id = o.id
    ) a ON true
    ORDER BY o.prioridade DESC, o.numero_onda;
END;
$function$;

REVOKE ALL ON FUNCTION public.separacao_buscar_ondas(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.separacao_buscar_ondas(uuid, uuid, uuid) TO authenticated, service_role;

-- 4. Conferência ------------------------------------------------------
DROP FUNCTION public.conferencia_buscar_ondas(uuid, uuid, uuid);

CREATE FUNCTION public.conferencia_buscar_ondas(p_tenant_id uuid, p_empresa_id uuid, p_usuario_id uuid)
RETURNS TABLE(
  movimento_saida_id uuid, numero_onda bigint, pedidos text, tipo_venda text,
  prioridade text, status text,
  exibe_parceiro boolean, parceiro_nome text,
  exibe_vendedor boolean, vendedor_nome text
)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
    v_zona_usuario uuid;
BEGIN
    PERFORM public.assert_tenant_access(p_tenant_id);

    SELECT u.zona_atividade_separacao
    INTO v_zona_usuario
    FROM usuario u
    WHERE u.id = p_usuario_id AND u.tenant_id = p_tenant_id;

    RETURN QUERY
    SELECT
        ms.id,
        ms.numero_onda,
        string_agg(DISTINCT ds.numero_pedido::text, ', ') AS pedidos,
        ts.descricao AS tipo_venda,
        ms.prioridade::text,
        ms.status::text,
        COALESCE(bool_and(ts.exibe_parceiro_conferencia), false) AS exibe_parceiro,
        CASE
            WHEN COALESCE(bool_and(ts.exibe_parceiro_conferencia), false) THEN
                string_agg(DISTINCT COALESCE(NULLIF(trim(p.nome_fantasia), ''), p.razaosocial), ' / ')::text
            ELSE NULL
        END AS parceiro_nome,
        COALESCE(bool_and(ts.exibe_vendedor_conferencia), false) AS exibe_vendedor,
        CASE
            WHEN COALESCE(bool_and(ts.exibe_vendedor_conferencia), false) THEN
                string_agg(DISTINCT NULLIF(btrim(ds.vendedor), ''), ' / ')::text
            ELSE NULL
        END AS vendedor_nome
    FROM movimento_saida ms
    JOIN movimento_saida_documento msd ON msd.movimento_saida_id = ms.id
    JOIN documento_saida ds ON ds.id = msd.documento_saida_id
    JOIN tipo_saida ts ON ts.id = ds.tipo_pedido_id
    LEFT JOIN parceiro p ON p.id = ds.parceiro_id
    LEFT JOIN tipo_saida ts_mov ON ts_mov.id = ms.tipo_saida
    WHERE
        ms.tenant_id = p_tenant_id
        AND ms.empresa_id = p_empresa_id
        AND ms.status IN ('SEPARADO', 'EM_CONFERENCIA')
        AND ts.realiza_conferencia = true
        AND (
            CASE
                WHEN COALESCE(ts_mov.reserva_conferencia_movimento, true) THEN
                    NOT EXISTS (
                        SELECT 1
                        FROM movimento_saida_item msi
                        JOIN tarefa t ON t.id_documento_origem = msi.id
                        JOIN tarefa_atribuicao ta
                            ON ta.tarefa_id = t.id AND ta.status = 'ATIVO'
                        WHERE msi.movimento_saida_id = ms.id
                          AND ta.usuario_id <> p_usuario_id
                    )
                ELSE
                    EXISTS (
                        SELECT 1
                        FROM movimento_saida_item msi
                        JOIN tarefa t ON t.id_documento_origem = msi.id
                        JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id
                        WHERE msi.movimento_saida_id = ms.id
                          AND tt.codigo = 'SEP-CONF'
                          AND t.quantidade_requerida > COALESCE(t.quantidade_executada, 0)
                          AND (
                              t.status = 'CRIADA'
                              OR (
                                  t.status IN ('ATRIBUIDA', 'EM_ANDAMENTO')
                                  AND EXISTS (
                                      SELECT 1 FROM tarefa_atribuicao ta
                                      WHERE ta.tarefa_id = t.id
                                        AND ta.usuario_id = p_usuario_id
                                        AND ta.status = 'ATRIBUIDA'
                                  )
                              )
                          )
                    )
            END
        )
        AND (
            v_zona_usuario IS NULL
            OR EXISTS (
                SELECT 1
                FROM movimento_saida_item msi2
                JOIN tarefa t2 ON t2.id_documento_origem = msi2.id
                JOIN tipo_tarefa tt2 ON tt2.id = t2.tipo_tarefa_id
                JOIN endereco_zona_atividade eza
                    ON eza.endereco_id = t2.id_local_origem
                   AND eza.tenant_id = p_tenant_id
                WHERE msi2.movimento_saida_id = ms.id
                  AND tt2.codigo = 'SEP-CONF'
                  AND t2.status IN ('CRIADA', 'ATRIBUIDA', 'EM_ANDAMENTO')
                  AND eza.zona_atividade_id = v_zona_usuario
            )
        )
    GROUP BY
        ms.id, ms.numero_onda, ts.descricao, ms.prioridade, ms.status
    ORDER BY
        ms.prioridade DESC, ms.numero_onda;
END;
$function$;

REVOKE ALL ON FUNCTION public.conferencia_buscar_ondas(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conferencia_buscar_ondas(uuid, uuid, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
