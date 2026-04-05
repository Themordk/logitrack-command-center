
-- 1. Drop view first (depends on abastecimento_id)
DROP VIEW IF EXISTS vw_abastecimento_lista;

-- 2. Drop index
DROP INDEX IF EXISTS idx_tarefa_abastecimento;

-- 3. Drop column
ALTER TABLE public.tarefa DROP COLUMN IF EXISTS abastecimento_id;

-- 4. Recreate view using id_documento_origem
CREATE OR REPLACE VIEW vw_abastecimento_lista AS
SELECT
  a.id, a.tenant_id, a.empresa_id, a.armazem_id, a.tipo, a.status,
  a.criado_em, a.criado_por, a.finalizado_em, a.total_tarefas, a.total_itens, a.observacao,
  az.descricao AS armazem_descricao,
  u.login AS criado_por_login,
  COALESCE(tc.count_tarefas, 0) AS tarefas_vinculadas,
  COALESCE(tc.tarefas_concluidas, 0) AS tarefas_concluidas
FROM abastecimento a
LEFT JOIN armazem az ON az.id = a.armazem_id
LEFT JOIN usuario u ON u.id = a.criado_por
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)::integer AS count_tarefas,
    COUNT(*) FILTER (WHERE t.status = 'CONCLUIDA')::integer AS tarefas_concluidas
  FROM tarefa t
  WHERE t.id_documento_origem = a.id
) tc ON true;

-- 5. Recreate RPC using id_documento_origem
CREATE OR REPLACE FUNCTION public.fn_gerar_abastecimento(
  p_tenant_id uuid,
  p_empresa_id uuid,
  p_armazem_id uuid,
  p_tipo text,
  p_usuario_id uuid,
  p_simular boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_abast_id uuid;
  v_tipo enum_tipo_abastecimento;
  v_tipo_tarefa_abast uuid := '172beee9-65ac-44dc-95a2-36b67b4aebbe';
  v_tipo_tarefa_sep uuid := 'd02db562-04f9-4a71-bcd9-af827623b1f7';
  v_result jsonb := '[]'::jsonb;
  v_alertas jsonb := '[]'::jsonb;
  v_total_tarefas integer := 0;
  v_total_itens numeric := 0;
  rec RECORD;
BEGIN
  v_tipo := p_tipo::enum_tipo_abastecimento;

  IF NOT p_simular THEN
    INSERT INTO abastecimento (tenant_id, empresa_id, armazem_id, tipo, criado_por)
    VALUES (p_tenant_id, p_empresa_id, p_armazem_id, v_tipo, p_usuario_id)
    RETURNING id INTO v_abast_id;
  END IF;

  IF v_tipo = 'PREVENTIVO' THEN
    FOR rec IN
      WITH demanda_sep AS (
        SELECT t.produto_id,
               SUM(t.quantidade_requerida) AS qtd_demanda
        FROM tarefa t
        WHERE t.tenant_id = p_tenant_id
          AND t.empresa_id = p_empresa_id
          AND t.armazem_id = p_armazem_id
          AND t.tipo_tarefa_id = v_tipo_tarefa_sep
          AND t.status IN ('CRIADA', 'ATRIBUIDA', 'EM_ANDAMENTO')
          AND t.produto_id IS NOT NULL
        GROUP BY t.produto_id
      ),
      saldo_picking AS (
        SELECT eg.produto_id,
               SUM(eg.quantidade_disponivel) AS saldo
        FROM estoque_geral eg
        JOIN endereco e ON e.id = eg.endereco_id AND e.tipo_endereco = 'PICKING'
        WHERE eg.tenant_id = p_tenant_id
          AND eg.empresa_id = p_empresa_id
          AND e.armazem_id = p_armazem_id
        GROUP BY eg.produto_id
      ),
      saldo_pulmao AS (
        SELECT eg.produto_id,
               eg.endereco_id,
               eg.quantidade_disponivel AS saldo,
               ROW_NUMBER() OVER (PARTITION BY eg.produto_id ORDER BY eg.quantidade_disponivel DESC) AS rn
        FROM estoque_geral eg
        JOIN endereco e ON e.id = eg.endereco_id AND e.tipo_endereco = 'PULMAO'
        WHERE eg.tenant_id = p_tenant_id
          AND eg.empresa_id = p_empresa_id
          AND e.armazem_id = p_armazem_id
          AND eg.quantidade_disponivel > 0
      ),
      picking_dest AS (
        SELECT pp.produto_id, pp.endereco_id,
               ROW_NUMBER() OVER (PARTITION BY pp.produto_id ORDER BY pp.endereco_id) AS rn
        FROM picking_produto pp
        WHERE pp.tenant_id = p_tenant_id
          AND pp.armazem_id = p_armazem_id
          AND pp.ativo = true
      )
      SELECT
        d.produto_id,
        p.sku AS produto_sku,
        p.descricao AS produto_desc,
        d.qtd_demanda,
        COALESCE(sp.saldo, 0) AS saldo_picking,
        GREATEST(d.qtd_demanda - COALESCE(sp.saldo, 0), 0) AS necessidade,
        COALESCE(spm.saldo, 0) AS saldo_pulmao,
        LEAST(GREATEST(d.qtd_demanda - COALESCE(sp.saldo, 0), 0), COALESCE(spm.saldo, 0)) AS qtd_abastecer,
        spm.endereco_id AS endereco_origem,
        pd.endereco_id AS endereco_destino,
        eo.descricao AS endereco_origem_desc,
        ed.descricao AS endereco_destino_desc
      FROM demanda_sep d
      JOIN produto p ON p.id = d.produto_id
      LEFT JOIN saldo_picking sp ON sp.produto_id = d.produto_id
      LEFT JOIN saldo_pulmao spm ON spm.produto_id = d.produto_id AND spm.rn = 1
      LEFT JOIN picking_dest pd ON pd.produto_id = d.produto_id AND pd.rn = 1
      LEFT JOIN endereco eo ON eo.id = spm.endereco_id
      LEFT JOIN endereco ed ON ed.id = pd.endereco_id
      WHERE GREATEST(d.qtd_demanda - COALESCE(sp.saldo, 0), 0) > 0
    LOOP
      IF rec.qtd_abastecer > 0 AND rec.endereco_origem IS NOT NULL AND rec.endereco_destino IS NOT NULL THEN
        IF NOT EXISTS (
          SELECT 1 FROM tarefa t2
          WHERE t2.tenant_id = p_tenant_id
            AND t2.tipo_tarefa_id = v_tipo_tarefa_abast
            AND t2.produto_id = rec.produto_id
            AND t2.id_local_destino = rec.endereco_destino
            AND t2.status IN ('CRIADA', 'ATRIBUIDA', 'EM_ANDAMENTO')
        ) THEN
          IF NOT p_simular THEN
            INSERT INTO tarefa (tenant_id, empresa_id, tipo_tarefa_id, produto_id,
              id_local_origem, id_local_destino, quantidade_requerida, armazem_id, id_documento_origem, prioridade)
            VALUES (p_tenant_id, p_empresa_id, v_tipo_tarefa_abast, rec.produto_id,
              rec.endereco_origem, rec.endereco_destino, rec.qtd_abastecer, p_armazem_id, v_abast_id, 1);
          END IF;
          v_total_tarefas := v_total_tarefas + 1;
          v_total_itens := v_total_itens + rec.qtd_abastecer;
          v_result := v_result || jsonb_build_object(
            'produto_id', rec.produto_id, 'sku', rec.produto_sku, 'descricao', rec.produto_desc,
            'necessidade', rec.necessidade, 'saldo_pulmao', rec.saldo_pulmao,
            'qtd_abastecer', rec.qtd_abastecer,
            'endereco_origem', rec.endereco_origem_desc, 'endereco_destino', rec.endereco_destino_desc
          );
        END IF;
      ELSIF rec.necessidade > 0 AND (rec.saldo_pulmao = 0 OR rec.endereco_origem IS NULL) THEN
        v_alertas := v_alertas || jsonb_build_object(
          'sku', rec.produto_sku, 'descricao', rec.produto_desc,
          'necessidade', rec.necessidade, 'motivo', 'Sem saldo no pulmão'
        );
      END IF;
    END LOOP;

  ELSIF v_tipo = 'CORRETIVO' THEN
    FOR rec IN
      WITH saldo_picking AS (
        SELECT eg.produto_id, pp.endereco_id,
               SUM(eg.quantidade_disponivel) AS saldo_atual,
               pp.est_minimo, pp.est_maximo
        FROM picking_produto pp
        JOIN estoque_geral eg ON eg.endereco_id = pp.endereco_id AND eg.produto_id = pp.produto_id
          AND eg.tenant_id = p_tenant_id
        WHERE pp.tenant_id = p_tenant_id
          AND pp.armazem_id = p_armazem_id
          AND pp.ativo = true
        GROUP BY eg.produto_id, pp.endereco_id, pp.est_minimo, pp.est_maximo
      ),
      picking_sem_saldo AS (
        SELECT pp.produto_id, pp.endereco_id, pp.est_minimo, pp.est_maximo, 0::numeric AS saldo_atual
        FROM picking_produto pp
        WHERE pp.tenant_id = p_tenant_id
          AND pp.armazem_id = p_armazem_id
          AND pp.ativo = true
          AND NOT EXISTS (
            SELECT 1 FROM estoque_geral eg
            WHERE eg.endereco_id = pp.endereco_id AND eg.produto_id = pp.produto_id AND eg.tenant_id = p_tenant_id
          )
      ),
      all_picking AS (
        SELECT * FROM saldo_picking
        UNION ALL
        SELECT * FROM picking_sem_saldo
      ),
      saldo_pulmao AS (
        SELECT eg.produto_id,
               eg.endereco_id,
               eg.quantidade_disponivel AS saldo,
               ROW_NUMBER() OVER (PARTITION BY eg.produto_id ORDER BY eg.quantidade_disponivel DESC) AS rn
        FROM estoque_geral eg
        JOIN endereco e ON e.id = eg.endereco_id AND e.tipo_endereco = 'PULMAO'
        WHERE eg.tenant_id = p_tenant_id
          AND eg.empresa_id = p_empresa_id
          AND e.armazem_id = p_armazem_id
          AND eg.quantidade_disponivel > 0
      )
      SELECT
        ap.produto_id,
        p.sku AS produto_sku,
        p.descricao AS produto_desc,
        ap.saldo_atual,
        ap.est_minimo,
        ap.est_maximo,
        GREATEST(ap.est_maximo - ap.saldo_atual, 0) AS necessidade,
        COALESCE(spm.saldo, 0) AS saldo_pulmao,
        LEAST(GREATEST(ap.est_maximo - ap.saldo_atual, 0), COALESCE(spm.saldo, 0)) AS qtd_abastecer,
        spm.endereco_id AS endereco_origem,
        ap.endereco_id AS endereco_destino,
        eo.descricao AS endereco_origem_desc,
        ed.descricao AS endereco_destino_desc
      FROM all_picking ap
      JOIN produto p ON p.id = ap.produto_id
      LEFT JOIN saldo_pulmao spm ON spm.produto_id = ap.produto_id AND spm.rn = 1
      LEFT JOIN endereco eo ON eo.id = spm.endereco_id
      LEFT JOIN endereco ed ON ed.id = ap.endereco_id
      WHERE ap.saldo_atual <= ap.est_minimo
    LOOP
      IF rec.qtd_abastecer > 0 AND rec.endereco_origem IS NOT NULL THEN
        IF NOT EXISTS (
          SELECT 1 FROM tarefa t2
          WHERE t2.tenant_id = p_tenant_id
            AND t2.tipo_tarefa_id = v_tipo_tarefa_abast
            AND t2.produto_id = rec.produto_id
            AND t2.id_local_destino = rec.endereco_destino
            AND t2.status IN ('CRIADA', 'ATRIBUIDA', 'EM_ANDAMENTO')
        ) THEN
          IF NOT p_simular THEN
            INSERT INTO tarefa (tenant_id, empresa_id, tipo_tarefa_id, produto_id,
              id_local_origem, id_local_destino, quantidade_requerida, armazem_id, id_documento_origem, prioridade)
            VALUES (p_tenant_id, p_empresa_id, v_tipo_tarefa_abast, rec.produto_id,
              rec.endereco_origem, rec.endereco_destino, rec.qtd_abastecer, p_armazem_id, v_abast_id, 1);
          END IF;
          v_total_tarefas := v_total_tarefas + 1;
          v_total_itens := v_total_itens + rec.qtd_abastecer;
          v_result := v_result || jsonb_build_object(
            'produto_id', rec.produto_id, 'sku', rec.produto_sku, 'descricao', rec.produto_desc,
            'saldo_atual', rec.saldo_atual, 'est_minimo', rec.est_minimo, 'est_maximo', rec.est_maximo,
            'necessidade', rec.necessidade, 'saldo_pulmao', rec.saldo_pulmao,
            'qtd_abastecer', rec.qtd_abastecer,
            'endereco_origem', rec.endereco_origem_desc, 'endereco_destino', rec.endereco_destino_desc
          );
        END IF;
      ELSIF rec.necessidade > 0 AND (rec.saldo_pulmao = 0 OR rec.endereco_origem IS NULL) THEN
        v_alertas := v_alertas || jsonb_build_object(
          'sku', rec.produto_sku, 'descricao', rec.produto_desc,
          'necessidade', rec.necessidade, 'motivo', 'Sem saldo no pulmão'
        );
      END IF;
    END LOOP;
  END IF;

  IF NOT p_simular AND v_abast_id IS NOT NULL THEN
    UPDATE abastecimento
    SET total_tarefas = v_total_tarefas, total_itens = v_total_itens
    WHERE id = v_abast_id;
  END IF;

  RETURN jsonb_build_object(
    'abastecimento_id', v_abast_id,
    'tipo', p_tipo,
    'simulacao', p_simular,
    'total_tarefas', v_total_tarefas,
    'total_itens', v_total_itens,
    'itens', v_result,
    'alertas', v_alertas
  );
END;
$$;
