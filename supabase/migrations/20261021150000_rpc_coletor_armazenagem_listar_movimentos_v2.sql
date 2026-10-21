-- =====================================================================
-- 2026-10-21 · Coletor · Armazenagem · lista de movimentos (/coletor/armazenagem/movimentos)
--
-- Padroniza a lista com a do Recebimento (recebimento_buscar_movimentos):
-- mesmas informações no card e mesmos nomes de campo, para reaproveitar
-- useRecebimentoFilter + FiltroRecebimentoSheet no frontend.
--
-- Correções:
--   1. Performance: a CTE tarefas_por_mov somava TODAS as tarefas ENTR-ARMZ
--      do tenant/empresa (histórico inteiro) antes de filtrar os movimentos.
--      Agora a agregação é LATERAL, só para os movimentos da lista.
--   2. Segurança: assert_tenant_access(p_tenant_id) no início (padrão das
--      demais RPCs do coletor) e joins com tenant_id explícito.
--   3. Pendência: além de CRIADA/EM_ANDAMENTO, contam como pendentes as
--      tarefas ATRIBUIDA e PAUSADA (não concluídas). Tarefas CANCELADA saem do
--      total e do percentual.
--   4. Documento excluído (status 9 / excluido_em) não entra em parceiro/NF.
--
-- Compatibilidade: as 12 colunas atuais continuam com o mesmo nome e tipo,
-- na mesma ordem; as novas vêm depois. Parâmetros atuais iguais
-- (p_armazem_id é novo e opcional). O coletor publicado continua funcionando
-- e ignora as colunas novas. Como o RETURNS TABLE muda: DROP + CREATE.
--
-- Rollback: recriar a função a partir de integracao.bkp_funcao_definicao
-- (motivo = 'Antes de 20261021150000_...').
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Backup da definição atual
-- ---------------------------------------------------------------------
INSERT INTO integracao.bkp_funcao_definicao (id, funcao, definicao, motivo, criado_em)
SELECT gen_random_uuid(),
       'public.rpc_coletor_armazenagem_listar_movimentos(uuid,uuid)',
       pg_get_functiondef('public.rpc_coletor_armazenagem_listar_movimentos(uuid,uuid)'::regprocedure),
       'Antes de 20261021150000_rpc_coletor_armazenagem_listar_movimentos_v2',
       now();

-- ---------------------------------------------------------------------
-- 1) Índice de apoio: movimentos em armazenagem (índice parcial pequeno)
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_mov_entrada_armazenagem_lista
  ON public.movimento_entrada (tenant_id, empresa_id, created_at)
  WHERE status IN ('LIB_ARMAZENAGEM', 'ARMAZENAGEM_PARCIAL');

-- ---------------------------------------------------------------------
-- 2) RPC
-- ---------------------------------------------------------------------
DROP FUNCTION public.rpc_coletor_armazenagem_listar_movimentos(uuid, uuid);

CREATE FUNCTION public.rpc_coletor_armazenagem_listar_movimentos(
  p_tenant_id  uuid,
  p_empresa_id uuid,
  p_armazem_id uuid DEFAULT NULL
)
RETURNS TABLE(
  -- colunas existentes (mesma ordem / tipo)
  movimento_entrada_id   uuid,
  numero_movimento       numeric,
  status_movimento       text,
  created_at             timestamptz,
  box_descricao          text,
  total_itens            integer,
  itens_armazenados      integer,
  itens_pendentes        integer,
  qtd_total_requerida    numeric,
  qtd_total_executada    numeric,
  percentual_concluido   numeric,
  parceiro_nome          text,
  -- colunas novas (mesmos nomes do recebimento_buscar_movimentos)
  tipo_entrada_id        uuid,
  tipo_entrada           text,
  prioridade             text,
  devolucao              boolean,
  crossdocking           boolean,
  parceiro               text,
  parceiro_busca         text,
  notas                  text,
  qtd_documentos         integer,
  placa_veiculo          text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER          -- RLS das tabelas continua valendo
SET search_path TO 'public'
AS $function$
DECLARE
  v_tipo_armz uuid;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id obrigatório';
  END IF;

  PERFORM public.assert_tenant_access(p_tenant_id);

  SELECT tt.id
    INTO v_tipo_armz
    FROM public.tipo_tarefa tt
   WHERE tt.tenant_id = p_tenant_id
     AND tt.codigo = 'ENTR-ARMZ'
   LIMIT 1;

  IF v_tipo_armz IS NULL THEN
    RETURN;   -- tenant sem tipo de tarefa de armazenagem: lista vazia
  END IF;

  RETURN QUERY
  SELECT
    me.id,
    me.numero_movimento::numeric,
    me.status::text,
    me.created_at::timestamptz,
    b.descricao::text,
    tp.total_itens,
    tp.itens_armz,
    tp.itens_pend,
    tp.qtd_req,
    tp.qtd_exec,
    ROUND(tp.qtd_exec / NULLIF(tp.qtd_req, 0) * 100, 1),
    docs.parceiro::text,
    me.tipo_entrada_id,
    te.descricao::text,
    COALESCE(te.prioridade::text, 'NORMAL'),
    COALESCE(te.devolucao, false),
    COALESCE(me.crossdocking, false),
    docs.parceiro::text,
    docs.parceiro_busca::text,
    docs.notas::text,
    COALESCE(docs.qtd_documentos, 0),
    me.placa_veiculo::text
  FROM public.movimento_entrada me
  LEFT JOIN public.box b
         ON b.id = me.box_id
        AND b.tenant_id = me.tenant_id
  LEFT JOIN public.tipo_entrada te
         ON te.id = me.tipo_entrada_id
        AND te.tenant_id = me.tenant_id
  -- Tarefas de armazenagem: 1 linha agregada por movimento
  CROSS JOIN LATERAL (
    SELECT
      count(t.id) FILTER (WHERE t.status <> 'CANCELADA')::int                                   AS total_itens,
      count(t.id) FILTER (WHERE t.status IN ('CONCLUIDA', 'AUDITADA'))::int                     AS itens_armz,
      count(t.id) FILTER (WHERE t.status IN ('CRIADA', 'ATRIBUIDA', 'EM_ANDAMENTO', 'PAUSADA'))::int AS itens_pend,
      COALESCE(sum(t.quantidade_requerida) FILTER (WHERE t.status <> 'CANCELADA'), 0)::numeric  AS qtd_req,
      COALESCE(sum(t.quantidade_executada) FILTER (WHERE t.status <> 'CANCELADA'), 0)::numeric  AS qtd_exec
    FROM public.movimento_entrada_item mei
    JOIN public.tarefa t
      ON t.id_documento_origem = mei.id
     AND t.tipo_tarefa_id = v_tipo_armz
     AND t.tenant_id = me.tenant_id
    WHERE mei.movimento_entrada_id = me.id
  ) tp
  -- Documentos / parceiros / notas: 1 linha agregada por movimento
  LEFT JOIN LATERAL (
    SELECT
      string_agg(DISTINCT COALESCE(NULLIF(trim(p.nome_fantasia), ''), p.razaosocial), ' / ')       AS parceiro,
      lower(string_agg(DISTINCT concat_ws(' ', p.razaosocial, p.nome_fantasia), ' | '))           AS parceiro_busca,
      string_agg(DISTINCT de.numero_nota::text, ', ')                                              AS notas,
      count(DISTINCT de.id)::int                                                                   AS qtd_documentos
    FROM public.movimento_entrada_documento med
    JOIN public.documento_entrada de
      ON de.id = med.documento_entrada_id
     AND de.tenant_id = me.tenant_id
     AND de.status <> 9
     AND de.excluido_em IS NULL
    LEFT JOIN public.parceiro p
      ON p.id = de.parceiro_id
    WHERE med.movimento_entrada_id = me.id
  ) docs ON true
  WHERE me.tenant_id  = p_tenant_id
    AND me.empresa_id = p_empresa_id
    AND me.status IN ('LIB_ARMAZENAGEM', 'ARMAZENAGEM_PARCIAL')
    AND (p_armazem_id IS NULL OR me.armazem_id = p_armazem_id)
    AND tp.itens_pend > 0
  ORDER BY
    COALESCE(te.prioridade, 'NORMAL'::enum_prioridade_onda),   -- URGENTE > ALTA > NORMAL > BAIXA
    me.created_at;                                              -- mais antigo primeiro (como hoje)
END;
$function$;

COMMENT ON FUNCTION public.rpc_coletor_armazenagem_listar_movimentos(uuid, uuid, uuid) IS
  'Coletor · Armazenagem: movimentos LIB_ARMAZENAGEM / ARMAZENAGEM_PARCIAL com tarefas ENTR-ARMZ pendentes. Campos alinhados com recebimento_buscar_movimentos.';

REVOKE ALL     ON FUNCTION public.rpc_coletor_armazenagem_listar_movimentos(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.rpc_coletor_armazenagem_listar_movimentos(uuid, uuid, uuid) TO authenticated, service_role;
