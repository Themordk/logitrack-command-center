-- Fluxo de Expedição · F5.4 — o coletor mostra a unidade de conferência (e o grupo de separação)
-- 2026-11-13 (QA). Só leitura: nenhuma regra de reserva muda.
-- 1) _fn_unidade_conf_descricao: texto único da unidade ("Grupo de separação 2 · HU 000123")
-- 2) rpc_coletor_onda_resumo devolve 'unidades' (total, livres, em andamento, concluídas, a minha)
-- 3) conferencia_buscar_tarefas devolve a unidade de cada tarefa (unidade_sequencia, unidade_descricao, unidades_total)

CREATE OR REPLACE FUNCTION public._fn_unidade_conf_descricao(p_grupo_conferencia_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT concat_ws(' · ',
           CASE WHEN gc.grupo_separacao_id IS NOT NULL THEN 'Grupo de separação ' || gs.sequencia
                WHEN 'GRUPO_SEPARACAO' = ANY (gc.criterios) THEN 'Sem grupo' END,
           CASE WHEN gc.hu_id IS NOT NULL THEN 'HU ' || COALESCE(h.codigo_hu, gc.hu_id::text)
                WHEN 'HU_VOLUME' = ANY (gc.criterios) THEN 'Sem HU' END)
    FROM grupo_conferencia gc
    LEFT JOIN grupo_separacao gs ON gs.id = gc.grupo_separacao_id
    LEFT JOIN hu h ON h.id = gc.hu_id
   WHERE gc.id = p_grupo_conferencia_id;
$$;
REVOKE ALL ON FUNCTION public._fn_unidade_conf_descricao(uuid) FROM PUBLIC, anon, authenticated;

-- Resumo das unidades da etapa (SEP = grupos de separação; SEP-CONF = unidades de conferência)
CREATE OR REPLACE FUNCTION public._fn_onda_unidades_resumo(p_movimento_saida_id uuid, p_tipo_tarefa_id uuid, p_etapa text, p_usuario_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH u AS (
    SELECT g.id, g.sequencia,
           CASE WHEN p_etapa = 'SEP-CONF' THEN public._fn_unidade_conf_descricao(g.id) END AS descricao
      FROM grupo_conferencia g WHERE p_etapa = 'SEP-CONF' AND g.movimento_saida_id = p_movimento_saida_id
    UNION ALL
    SELECT g.id, g.sequencia,
           concat_ws(' · ', 'Grupo ' || g.sequencia, za.descricao)
      FROM grupo_separacao g LEFT JOIN zona_atividade za ON za.id = g.zona_atividade_id
     WHERE p_etapa = 'SEP' AND g.movimento_saida_id = p_movimento_saida_id
  ), st AS (
    SELECT u.id, u.sequencia, u.descricao,
           count(t.id) FILTER (WHERE t.status NOT IN ('CONCLUIDA','CANCELADA')) AS abertas,
           bool_or(ta.id IS NOT NULL) AS ocupada,
           bool_or(ta.usuario_id = p_usuario_id) AS minha
      FROM u
      LEFT JOIN tarefa t ON t.tipo_tarefa_id = p_tipo_tarefa_id AND t.status <> 'CANCELADA'
                        AND (CASE WHEN p_etapa = 'SEP-CONF' THEN t.grupo_conferencia_id ELSE t.grupo_separacao_id END) = u.id
      LEFT JOIN tarefa_atribuicao ta ON ta.tarefa_id = t.id AND ta.liberado_em IS NULL
                                    AND t.status IN ('CRIADA','ATRIBUIDA','EM_ANDAMENTO','PAUSADA')
     GROUP BY u.id, u.sequencia, u.descricao
  )
  SELECT jsonb_build_object(
           'total', count(*),
           'livres', count(*) FILTER (WHERE abertas > 0 AND NOT COALESCE(ocupada, false)),
           'em_andamento', count(*) FILTER (WHERE abertas > 0 AND COALESCE(ocupada, false)),
           'concluidas', count(*) FILTER (WHERE abertas = 0),
           'minha', (SELECT jsonb_build_object('sequencia', s2.sequencia, 'descricao', s2.descricao)
                       FROM st s2 WHERE s2.minha ORDER BY s2.sequencia LIMIT 1))
    FROM st;
$$;
REVOKE ALL ON FUNCTION public._fn_onda_unidades_resumo(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.rpc_coletor_onda_resumo'::regproc);
  n := replace(d, $a$    'operadores', v_operadores);$a$,
                  $b$    'operadores', v_operadores,
    'unidades', public._fn_onda_unidades_resumo(p_movimento_saida_id, v_tipo, p_etapa, p_usuario_id));$b$);
  IF n = d THEN RAISE EXCEPTION 'F5.4: padrão do rpc_coletor_onda_resumo não encontrado'; END IF;
  EXECUTE n;
END $$;

-- conferencia_buscar_tarefas: mesmo corpo, com as colunas da unidade no retorno
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.conferencia_buscar_tarefas(uuid, uuid, uuid, uuid)'::regprocedure);
  n := replace(d, $a$quantidade_requerida numeric, conferido numeric, status text)$a$,
                  $b$quantidade_requerida numeric, conferido numeric, status text, unidade_sequencia integer, unidade_descricao text, unidades_total integer)$b$);
  n := replace(n, $a$      COALESCE(t.quantidade_executada, 0)::numeric AS conferido,
      t.status::text
  FROM tarefa t$a$, $b$      COALESCE(t.quantidade_executada, 0)::numeric AS conferido,
      t.status::text,
      gc.sequencia::integer,
      CASE WHEN gc.id IS NOT NULL THEN public._fn_unidade_conf_descricao(gc.id) END,
      (SELECT count(*)::integer FROM grupo_conferencia g2 WHERE g2.movimento_saida_id = p_movimento_saida_id)
  FROM tarefa t
  LEFT JOIN grupo_conferencia gc ON gc.id = t.grupo_conferencia_id$b$);
  IF n = d OR position('unidades_total integer' in n) = 0 OR position('LEFT JOIN grupo_conferencia gc' in n) = 0 THEN
    RAISE EXCEPTION 'F5.4: padrões do conferencia_buscar_tarefas não encontrados';
  END IF;
  -- muda o tipo de retorno: precisa recriar
  DROP FUNCTION public.conferencia_buscar_tarefas(uuid, uuid, uuid, uuid);
  EXECUTE n;
  REVOKE ALL ON FUNCTION public.conferencia_buscar_tarefas(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.conferencia_buscar_tarefas(uuid, uuid, uuid, uuid) TO authenticated, service_role;
END $$;
