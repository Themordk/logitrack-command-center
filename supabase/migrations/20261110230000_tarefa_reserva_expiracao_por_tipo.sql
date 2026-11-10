-- =====================================================================
-- 2026-11-10 · Tarefas · expiração de reserva por TIPO DE TAREFA
--
-- Problema: atribuições (tarefa_atribuicao) ficam presas a operadores que
-- abandonaram o trabalho (em produção, separações paradas desde jul/2026).
-- Desde 20261110202246 a conferência de saída respeita a reserva de verdade,
-- então reserva abandonada passou a prender a onda.
--
-- Configuração por tipo de tarefa (tipo_tarefa, por tenant):
--   reserva_acao        LIBERAR | LIBERAR_SEM_EXECUCAO | ALERTAR | NUNCA
--   reserva_expira_min  minutos sem atividade do operador (padrão 240 = 4h)
-- Ações permitidas por código (fn_tipo_tarefa_reserva_acoes):
--   SEP-CONF, ENTR-CONF  LIBERAR (padrão) | ALERTAR | NUNCA      (só contagem)
--   SEP                  LIBERAR_SEM_EXECUCAO (padrão) | ALERTAR | NUNCA
--                        (com coleta já feita o estoque saiu do endereço:
--                         nunca libera sozinho, avisa o supervisor)
--   PED-CAN              ALERTAR (padrão) | NUNCA  (produto na mão do operador)
--   demais               NUNCA (não usam reserva exclusiva: inventário conta em
--                        conjunto; ABAST/ARMZ/TRANF não usam tarefa_atribuicao)
--
-- Atividade = maior entre a última atribuição do operador e a última execução
-- dele em tarefas do MESMO tipo no MESMO documento (onda de saída, movimento de
-- entrada ou documento de origem).
--
-- Liberar = grava tarefa_reserva_liberacao (auditoria) e REMOVE a atribuição;
-- a tarefa sem atribuição ativa volta para CRIADA (quantidade_executada
-- mantida). Remover (em vez de marcar LIBERADA) mantém compatíveis as rotinas
-- que inserem atribuição sem ON CONFLICT (separação, conferência de entrada).
-- Alertar = notificacao_painel 'RESERVA_TAREFA_PARADA' por empresa (1 a cada 20h).
--
-- Execução: cron a cada 10 min + na hora no início da conferência de saída.
-- Substitui as migrations da branch feat/conferencia-reserva-expiracao
-- (20261110213000 / 20261110214500, aplicadas só no QA): limpa o que elas
-- criaram (IF EXISTS), sem efeito em produção.
-- =====================================================================

-- 0. Backups ----------------------------------------------------------
INSERT INTO integracao.bkp_funcao_definicao (id, funcao, definicao, motivo, criado_em)
SELECT gen_random_uuid(), f, pg_get_functiondef(f::regprocedure),
       'Antes de 20261110230000_tarefa_reserva_expiracao_por_tipo', now()
FROM unnest(ARRAY[
  'public.fn_conferencia_validar_onda(uuid,uuid,uuid,uuid)',
  'public.conferencia_buscar_tarefas(uuid,uuid,uuid,uuid)'
]) AS f;

-- 0.1 Limpeza da versão anterior (só existia no QA) --------------------
DROP FUNCTION IF EXISTS public.fn_conferencia_liberar_reservas_expiradas(uuid, uuid, uuid, integer, text);
DROP FUNCTION IF EXISTS public.fn_conferencia_reservas_onda(uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.fn_conferencia_reserva_expira_min(uuid, uuid);
ALTER TABLE public.armazem_config DROP COLUMN IF EXISTS conferencia_reserva_expira_min;

-- 1. Regras por código ------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_tipo_tarefa_reserva_acoes(p_codigo text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE upper(coalesce(p_codigo, ''))
    WHEN 'SEP-CONF'  THEN ARRAY['LIBERAR', 'ALERTAR', 'NUNCA']
    WHEN 'ENTR-CONF' THEN ARRAY['LIBERAR', 'ALERTAR', 'NUNCA']
    WHEN 'SEP'       THEN ARRAY['LIBERAR_SEM_EXECUCAO', 'ALERTAR', 'NUNCA']
    WHEN 'PED-CAN'   THEN ARRAY['ALERTAR', 'NUNCA']
    ELSE ARRAY['NUNCA']
  END;
$function$;

-- Padrão = primeira ação permitida
CREATE OR REPLACE FUNCTION public.fn_tipo_tarefa_reserva_acao_padrao(p_codigo text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT (public.fn_tipo_tarefa_reserva_acoes(p_codigo))[1];
$function$;

REVOKE ALL ON FUNCTION public.fn_tipo_tarefa_reserva_acoes(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_tipo_tarefa_reserva_acoes(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_tipo_tarefa_reserva_acao_padrao(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_tipo_tarefa_reserva_acao_padrao(text) TO authenticated, service_role;

-- 2. Configuração em tipo_tarefa --------------------------------------
ALTER TABLE public.tipo_tarefa
  ADD COLUMN IF NOT EXISTS reserva_acao text,
  ADD COLUMN IF NOT EXISTS reserva_expira_min integer NOT NULL DEFAULT 240;

UPDATE public.tipo_tarefa
   SET reserva_acao = public.fn_tipo_tarefa_reserva_acao_padrao(codigo)
 WHERE reserva_acao IS NULL;

ALTER TABLE public.tipo_tarefa ALTER COLUMN reserva_acao SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_tipo_tarefa_reserva_expira_min') THEN
    ALTER TABLE public.tipo_tarefa
      ADD CONSTRAINT ck_tipo_tarefa_reserva_expira_min CHECK (reserva_expira_min BETWEEN 15 AND 10080);
  END IF;
END $$;

COMMENT ON COLUMN public.tipo_tarefa.reserva_acao IS
  'O que fazer com atribuição sem atividade: LIBERAR | LIBERAR_SEM_EXECUCAO | ALERTAR | NUNCA (permitidas: fn_tipo_tarefa_reserva_acoes)';
COMMENT ON COLUMN public.tipo_tarefa.reserva_expira_min IS
  'Minutos sem atividade do operador para a reserva expirar (15 a 10080). Padrão 240.';

-- Preenche o padrão na criação (provisionamento de tenant) e valida a ação
CREATE OR REPLACE FUNCTION public.tg_tipo_tarefa_reserva()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.reserva_acao IS NULL THEN
    NEW.reserva_acao := public.fn_tipo_tarefa_reserva_acao_padrao(NEW.codigo);
  END IF;
  IF NOT (NEW.reserva_acao = ANY (public.fn_tipo_tarefa_reserva_acoes(NEW.codigo))) THEN
    RAISE EXCEPTION 'RESERVA_ACAO_INVALIDA: ação % não é permitida para o tipo de tarefa %.', NEW.reserva_acao, NEW.codigo
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_tipo_tarefa_reserva ON public.tipo_tarefa;
CREATE TRIGGER trg_tipo_tarefa_reserva
  BEFORE INSERT OR UPDATE OF reserva_acao, codigo ON public.tipo_tarefa
  FOR EACH ROW EXECUTE FUNCTION public.tg_tipo_tarefa_reserva();

-- 3. Auditoria das liberações -----------------------------------------
CREATE TABLE IF NOT EXISTS public.tarefa_reserva_liberacao (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES public.tenant(id),
  empresa_id        uuid,
  tarefa_id         uuid NOT NULL,
  tipo_tarefa_codigo text NOT NULL,
  grupo_id          uuid,
  usuario_id        uuid,
  atribuicao_status text,
  atribuido_em      timestamptz,
  ultima_atividade  timestamptz,
  expira_min        integer,
  origem            text NOT NULL,
  liberado_por      uuid,
  liberado_em       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tarefa_reserva_liberacao_tenant_data
  ON public.tarefa_reserva_liberacao (tenant_id, liberado_em DESC);
CREATE INDEX IF NOT EXISTS idx_tarefa_reserva_liberacao_tarefa
  ON public.tarefa_reserva_liberacao (tarefa_id);

ALTER TABLE public.tarefa_reserva_liberacao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tarefa_reserva_liberacao_select ON public.tarefa_reserva_liberacao;
CREATE POLICY tarefa_reserva_liberacao_select ON public.tarefa_reserva_liberacao
  FOR SELECT TO authenticated USING (tenant_id = get_current_tenant());

REVOKE ALL ON public.tarefa_reserva_liberacao FROM anon;
GRANT SELECT ON public.tarefa_reserva_liberacao TO authenticated;

COMMENT ON TABLE public.tarefa_reserva_liberacao IS
  'Atribuições removidas por expiração de reserva (fn_tarefa_liberar_reservas_expiradas). Somente leitura para usuários.';

-- 4. Situação das reservas abertas ------------------------------------
CREATE OR REPLACE FUNCTION public.fn_tarefa_reservas_status(
  p_tenant_id uuid, p_grupo_id uuid DEFAULT NULL, p_tipos text[] DEFAULT NULL
)
RETURNS TABLE(
  atribuicao_id uuid, atribuicao_status text, tarefa_id uuid, tipo_tarefa_codigo text, empresa_id uuid,
  grupo_id uuid, usuario_id uuid, usuario_nome text, atribuido_em timestamptz, ultima_atividade timestamptz,
  acao text, expira_min integer, expirada boolean, tem_execucao boolean, liberavel boolean, alertavel boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT ta.id AS atribuicao_id, ta.status AS atribuicao_status, ta.usuario_id, ta.atribuido_em,
           t.id AS tarefa_id, t.empresa_id, t.tipo_tarefa_id, tt.codigo, tt.reserva_acao, tt.reserva_expira_min,
           CASE WHEN msi.id IS NOT NULL THEN 'SAIDA' WHEN mei.id IS NOT NULL THEN 'ENTRADA' ELSE 'OUTRO' END AS grupo_tipo,
           COALESCE(msi.movimento_saida_id, mei.movimento_entrada_id, t.id_documento_origem, t.id) AS grupo_id,
           (COALESCE(t.quantidade_executada, 0) > 0 OR EXISTS (
              SELECT 1 FROM tarefa_execucao te0
              WHERE te0.tarefa_id = t.id AND te0.status::text <> 'CANCELADA')) AS tem_execucao
    FROM tarefa_atribuicao ta
    JOIN tarefa t       ON t.id = ta.tarefa_id AND t.tenant_id = p_tenant_id
    JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id
    LEFT JOIN movimento_saida_item msi
           ON t.tipo_documento_origem = 'MOVIMENTO_SAIDA_ITEM' AND msi.id = t.id_documento_origem
    LEFT JOIN movimento_entrada_item mei
           ON t.tipo_documento_origem = 'MOVIMENTO_ENTRADA_ITEM' AND mei.id = t.id_documento_origem
    WHERE ta.tenant_id = p_tenant_id
      AND ta.status IN ('ATRIBUIDA', 'ATIVO')
      AND ta.liberado_em IS NULL
      AND t.status::text IN ('ATRIBUIDA', 'EM_ANDAMENTO')
      AND tt.reserva_acao <> 'NUNCA'
      AND (p_tipos IS NULL OR tt.codigo = ANY (p_tipos))
      AND (p_grupo_id IS NULL
           OR msi.movimento_saida_id = p_grupo_id
           OR mei.movimento_entrada_id = p_grupo_id
           OR t.id_documento_origem = p_grupo_id
           OR t.id = p_grupo_id)
  ), grupos AS (
    SELECT b.usuario_id, b.tipo_tarefa_id, b.grupo_tipo, b.grupo_id, max(b.atribuido_em) AS ult_atrib
    FROM base b
    GROUP BY 1, 2, 3, 4
  ), ativ AS (
    SELECT g.*,
      (SELECT max(te.concluido_em)
         FROM tarefa_execucao te
         JOIN tarefa t2 ON t2.id = te.tarefa_id
        WHERE te.tenant_id = p_tenant_id
          AND te.usuario_id = g.usuario_id
          AND t2.tipo_tarefa_id = g.tipo_tarefa_id
          AND CASE g.grupo_tipo
                WHEN 'SAIDA'   THEN t2.id_documento_origem IN (SELECT m.id FROM movimento_saida_item m WHERE m.movimento_saida_id = g.grupo_id)
                WHEN 'ENTRADA' THEN t2.id_documento_origem IN (SELECT m.id FROM movimento_entrada_item m WHERE m.movimento_entrada_id = g.grupo_id)
                ELSE (t2.id_documento_origem = g.grupo_id OR t2.id = g.grupo_id)
              END) AS ult_exec
    FROM grupos g
  )
  SELECT b.atribuicao_id, b.atribuicao_status, b.tarefa_id, b.codigo, b.empresa_id,
         b.grupo_id, b.usuario_id, u.nome::text, b.atribuido_em, x.ultima,
         b.reserva_acao, b.reserva_expira_min, x.expirada, b.tem_execucao,
         x.expirada AND (b.reserva_acao = 'LIBERAR' OR (b.reserva_acao = 'LIBERAR_SEM_EXECUCAO' AND NOT b.tem_execucao)),
         x.expirada AND (b.reserva_acao = 'ALERTAR' OR (b.reserva_acao = 'LIBERAR_SEM_EXECUCAO' AND b.tem_execucao))
  FROM base b
  JOIN ativ a ON a.usuario_id = b.usuario_id AND a.tipo_tarefa_id = b.tipo_tarefa_id AND a.grupo_id = b.grupo_id
  LEFT JOIN usuario u ON u.id = b.usuario_id
  CROSS JOIN LATERAL (
    SELECT GREATEST(a.ult_atrib, a.ult_exec) AS ultima,
           GREATEST(a.ult_atrib, a.ult_exec) < now() - make_interval(mins => b.reserva_expira_min) AS expirada
  ) x;
$function$;

REVOKE ALL ON FUNCTION public.fn_tarefa_reservas_status(uuid, uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_reservas_status(uuid, uuid, text[]) TO service_role;

-- 5. Liberação / alerta -----------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_tarefa_liberar_reservas_expiradas(
  p_tenant_id uuid,
  p_grupo_id uuid DEFAULT NULL,
  p_usuario_excecao uuid DEFAULT NULL,
  p_origem text DEFAULT 'CRON',
  p_tipos text[] DEFAULT NULL,
  p_alertar boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tarefas   uuid[] := ARRAY[]::uuid[];
  v_liberadas integer := 0;
  v_reabertas integer := 0;
  v_alertas   integer := 0;
  r           record;
BEGIN
  -- 5.1 Liberar
  FOR r IN
    SELECT s.* FROM public.fn_tarefa_reservas_status(p_tenant_id, p_grupo_id, p_tipos) s
    WHERE s.liberavel AND s.usuario_id IS DISTINCT FROM p_usuario_excecao
  LOOP
    INSERT INTO tarefa_reserva_liberacao (tenant_id, empresa_id, tarefa_id, tipo_tarefa_codigo, grupo_id, usuario_id,
                                          atribuicao_status, atribuido_em, ultima_atividade, expira_min, origem)
    VALUES (p_tenant_id, r.empresa_id, r.tarefa_id, r.tipo_tarefa_codigo, r.grupo_id, r.usuario_id,
            r.atribuicao_status, r.atribuido_em, r.ultima_atividade, r.expira_min, p_origem);

    DELETE FROM tarefa_atribuicao WHERE id = r.atribuicao_id;
    v_liberadas := v_liberadas + 1;
    v_tarefas := array_append(v_tarefas, r.tarefa_id);
  END LOOP;

  IF v_liberadas > 0 THEN
    UPDATE tarefa t
       SET status = 'CRIADA'::enum_status_tarefa
     WHERE t.id = ANY (v_tarefas)
       AND t.tenant_id = p_tenant_id
       AND t.status::text IN ('ATRIBUIDA', 'EM_ANDAMENTO')
       AND NOT EXISTS (
         SELECT 1 FROM tarefa_atribuicao ta
         WHERE ta.tarefa_id = t.id AND ta.status IN ('ATRIBUIDA', 'ATIVO') AND ta.liberado_em IS NULL
       );
    GET DIAGNOSTICS v_reabertas = ROW_COUNT;
  END IF;

  -- 5.2 Alertar o supervisor (1 aviso por empresa a cada 20h)
  IF p_alertar THEN
    FOR r IN
      SELECT s.empresa_id,
             count(*) AS qtd,
             string_agg(DISTINCT s.tipo_tarefa_codigo, ', ') AS tipos,
             min(s.ultima_atividade) AS mais_antiga
      FROM public.fn_tarefa_reservas_status(p_tenant_id, p_grupo_id, p_tipos) s
      WHERE s.alertavel AND s.empresa_id IS NOT NULL
      GROUP BY s.empresa_id
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM notificacao_painel np
        WHERE np.tenant_id = p_tenant_id AND np.empresa_id = r.empresa_id
          AND np.tipo = 'RESERVA_TAREFA_PARADA' AND np.criado_em > now() - interval '20 hours'
      ) THEN
        INSERT INTO notificacao_painel (tenant_id, empresa_id, titulo, descricao, icone, cor, tipo, referencia_rota)
        VALUES (p_tenant_id, r.empresa_id,
                'Tarefas reservadas sem atividade',
                format('%s tarefa(s) (%s) presas a operadores sem atividade desde %s. Verifique se o operador ainda está com o produto antes de liberar.',
                       r.qtd, r.tipos, to_char(r.mais_antiga AT TIME ZONE 'America/Fortaleza', 'DD/MM/YYYY HH24:MI')),
                'AlertTriangle', 'orange', 'RESERVA_TAREFA_PARADA', '/atividades/mov-saida');
        v_alertas := v_alertas + 1;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('liberadas', v_liberadas, 'tarefas_reabertas', v_reabertas, 'alertas', v_alertas);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_tarefa_liberar_reservas_expiradas(uuid, uuid, uuid, text, text[], boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_liberar_reservas_expiradas(uuid, uuid, uuid, text, text[], boolean) TO service_role;

-- 6. Cron (a cada 10 min) ---------------------------------------------
CREATE OR REPLACE FUNCTION public.cron_liberar_reservas_tarefas()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  t        record;
  v_res    jsonb;
  v_total  jsonb := '[]'::jsonb;
BEGIN
  FOR t IN SELECT tn.id FROM tenant tn WHERE tn.ativo = true LOOP
    BEGIN
      v_res := public.fn_tarefa_liberar_reservas_expiradas(t.id, NULL, NULL, 'CRON', NULL, true);
      IF (v_res->>'liberadas')::int > 0 OR (v_res->>'alertas')::int > 0 THEN
        v_total := v_total || jsonb_build_object('tenant_id', t.id) || v_res;
        INSERT INTO log_cron_execucao (tenant_id, nome_cron, sucesso, erro)
        VALUES (t.id, 'cron_liberar_reservas_tarefas', true, v_res::text);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO log_cron_execucao (tenant_id, nome_cron, sucesso, erro)
      VALUES (t.id, 'cron_liberar_reservas_tarefas', false, SQLERRM);
    END;
  END LOOP;
  RETURN jsonb_build_object('executado_em', now(), 'resultados', v_total);
END;
$function$;

REVOKE ALL ON FUNCTION public.cron_liberar_reservas_tarefas() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_liberar_reservas_tarefas() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cron_liberar_reservas_tarefas') THEN
    PERFORM cron.unschedule('cron_liberar_reservas_tarefas');
  END IF;
  PERFORM cron.schedule('cron_liberar_reservas_tarefas', '*/10 * * * *', 'SELECT public.cron_liberar_reservas_tarefas()');
END $$;

-- 7. Conferência de saída: validador usa a regra por tipo -------------
CREATE OR REPLACE FUNCTION public.fn_conferencia_validar_onda(
  p_tenant_id uuid, p_empresa_id uuid, p_usuario_id uuid, p_movimento_saida_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ms            record;
  v_realiza       boolean;
  v_reserva_mov   boolean;
  v_zona_usuario  uuid;
  v_outro_nome    text;
  v_docs_sem_nf   integer;
  v_agrupamento   text[];
  v_vivos         uuid[];
  v_liberaveis    uuid[];
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);

  SELECT ms.id, ms.numero_onda, ms.status::text AS status, ms.tipo_saida
    INTO v_ms
  FROM movimento_saida ms
  WHERE ms.id = p_movimento_saida_id
    AND ms.tenant_id = p_tenant_id
    AND ms.empresa_id = p_empresa_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('permitido', false, 'codigo', 'CONF_ONDA_NAO_ENCONTRADA',
      'mensagem', 'Onda não encontrada nesta empresa.');
  END IF;

  IF v_ms.status NOT IN ('SEPARADO', 'EM_CONFERENCIA') THEN
    RETURN jsonb_build_object('permitido', false, 'codigo', 'CONF_STATUS_ONDA',
      'mensagem', format('Onda #%s está %s e não pode ser conferida.', v_ms.numero_onda, v_ms.status));
  END IF;

  SELECT bool_or(ts.realiza_conferencia)
    INTO v_realiza
  FROM movimento_saida_documento msd
  JOIN documento_saida ds ON ds.id = msd.documento_saida_id
  JOIN tipo_saida ts      ON ts.id = ds.tipo_pedido_id
  WHERE msd.movimento_saida_id = v_ms.id AND msd.tenant_id = p_tenant_id;

  IF NOT COALESCE(v_realiza, false) THEN
    RETURN jsonb_build_object('permitido', false, 'codigo', 'CONF_SEM_CONFERENCIA',
      'mensagem', format('O tipo de saída da onda #%s não realiza conferência.', v_ms.numero_onda));
  END IF;

  SELECT COALESCE(ts_mov.reserva_conferencia_movimento, true)
    INTO v_reserva_mov
  FROM (SELECT 1) x
  LEFT JOIN tipo_saida ts_mov ON ts_mov.id = v_ms.tipo_saida;

  -- Reservas de OUTROS operadores já expiradas e liberáveis (regra do tipo SEP-CONF)
  SELECT COALESCE(array_agg(s.atribuicao_id), ARRAY[]::uuid[])
    INTO v_liberaveis
  FROM public.fn_tarefa_reservas_status(p_tenant_id, v_ms.id, ARRAY['SEP-CONF']) s
  WHERE s.liberavel AND s.usuario_id <> p_usuario_id;

  -- Reservas de OUTROS operadores ainda válidas
  SELECT array_agg(DISTINCT ta.usuario_id), min(u.nome)
    INTO v_vivos, v_outro_nome
  FROM movimento_saida_item msi
  JOIN tarefa t            ON t.id_documento_origem = msi.id AND t.tenant_id = p_tenant_id
  JOIN tipo_tarefa tt      ON tt.id = t.tipo_tarefa_id AND tt.codigo = 'SEP-CONF'
  JOIN tarefa_atribuicao ta ON ta.tarefa_id = t.id AND ta.status = 'ATRIBUIDA' AND ta.liberado_em IS NULL
  LEFT JOIN usuario u      ON u.id = ta.usuario_id
  WHERE msi.movimento_saida_id = v_ms.id
    AND t.status IN ('ATRIBUIDA', 'EM_ANDAMENTO')
    AND ta.usuario_id <> p_usuario_id
    AND NOT (ta.id = ANY (v_liberaveis));

  v_vivos := COALESCE(v_vivos, ARRAY[]::uuid[]);

  IF v_reserva_mov AND cardinality(v_vivos) > 0 THEN
    RETURN jsonb_build_object('permitido', false, 'codigo', 'CONF_ONDA_RESERVADA',
      'mensagem', format('Onda #%s já está em conferência com %s.', v_ms.numero_onda, COALESCE(v_outro_nome, 'outro operador')));
  END IF;

  -- Existe trabalho para ESTE operador? (livre, minha, ou presa a reserva expirada)
  IF NOT EXISTS (
    SELECT 1
    FROM movimento_saida_item msi
    JOIN tarefa t       ON t.id_documento_origem = msi.id AND t.tenant_id = p_tenant_id
    JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id AND tt.codigo = 'SEP-CONF'
    WHERE msi.movimento_saida_id = v_ms.id
      AND t.quantidade_requerida > COALESCE(t.quantidade_executada, 0)
      AND (
        t.status = 'CRIADA'
        OR (t.status IN ('ATRIBUIDA', 'EM_ANDAMENTO') AND NOT EXISTS (
              SELECT 1 FROM tarefa_atribuicao ta
              WHERE ta.tarefa_id = t.id AND ta.status = 'ATRIBUIDA'
                AND ta.usuario_id = ANY (v_vivos)
        ))
      )
  ) THEN
    RETURN jsonb_build_object('permitido', false, 'codigo', 'CONF_SEM_TAREFAS',
      'mensagem', format('Onda #%s não tem tarefas de conferência disponíveis para você.', v_ms.numero_onda));
  END IF;

  -- Zona de atividade (zona de separação do operador)
  SELECT u.zona_atividade_separacao INTO v_zona_usuario
  FROM usuario u WHERE u.id = p_usuario_id AND u.tenant_id = p_tenant_id;

  IF v_zona_usuario IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM movimento_saida_item msi
    JOIN tarefa t       ON t.id_documento_origem = msi.id AND t.tenant_id = p_tenant_id
    JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id AND tt.codigo = 'SEP-CONF'
    JOIN endereco_zona_atividade eza
      ON eza.endereco_id = t.id_local_origem AND eza.tenant_id = p_tenant_id
    WHERE msi.movimento_saida_id = v_ms.id
      AND t.status IN ('CRIADA', 'ATRIBUIDA', 'EM_ANDAMENTO')
      AND eza.zona_atividade_id = v_zona_usuario
  ) THEN
    RETURN jsonb_build_object('permitido', false, 'codigo', 'CONF_FORA_DA_ZONA',
      'mensagem', format('Onda #%s não tem itens na sua zona de atividade.', v_ms.numero_onda));
  END IF;

  -- Modo de conferência (sempre por último)
  v_docs_sem_nf := public.fn_conferencia_docs_sem_nf(p_tenant_id, v_ms.id);
  IF v_docs_sem_nf > 0 THEN
    RETURN jsonb_build_object('permitido', false, 'codigo', 'CONF_AGUARDANDO_NF',
      'mensagem', format('Onda #%s aguardando faturamento: %s pedido(s) sem NF autorizada.', v_ms.numero_onda, v_docs_sem_nf),
      'docs_sem_nf', v_docs_sem_nf);
  END IF;

  SELECT array_agg(ac.tipo_agrupamento::text ORDER BY ac.sequencia)
    INTO v_agrupamento
  FROM agrupamento_conferencia ac
  WHERE ac.tenant_id = p_tenant_id AND ac.empresa_id = p_empresa_id;

  RETURN jsonb_build_object('permitido', true, 'codigo', 'OK',
    'mensagem', 'Onda disponível para conferência.',
    'reserva_movimento', v_reserva_mov,
    'reservas_expiradas', cardinality(v_liberaveis),
    'unidade_conferencia', 'ONDA',
    'agrupamento_roteiro', to_jsonb(COALESCE(v_agrupamento, ARRAY[]::text[])));
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_conferencia_validar_onda(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_conferencia_validar_onda(uuid, uuid, uuid, uuid) TO authenticated, service_role;

-- 8. Início da conferência: libera expiradas antes de atribuir ---------
CREATE OR REPLACE FUNCTION public.conferencia_buscar_tarefas(p_tenant_id uuid, p_empresa_id uuid, p_usuario_id uuid, p_movimento_saida_id uuid)
RETURNS TABLE(id uuid, tarefa_id uuid, produto_id uuid, ordem_tarefa integer, sku text, descricao text, fator_caixa numeric, quantidade_requerida numeric, conferido numeric, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tarefa_ids    uuid[];
  v_reserva_mov   boolean;
  v_zona_usuario  uuid;
  v_validacao     jsonb;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);
  IF p_tenant_id IS NULL OR p_empresa_id IS NULL OR p_usuario_id IS NULL OR p_movimento_saida_id IS NULL THEN
    RAISE EXCEPTION 'CONF_PARAMETROS: tenant, empresa, usuário e onda são obrigatórios.';
  END IF;

  -- Serializa inícios simultâneos da mesma onda
  PERFORM 1 FROM movimento_saida ms
  WHERE ms.id = p_movimento_saida_id AND ms.tenant_id = p_tenant_id AND ms.empresa_id = p_empresa_id
  FOR UPDATE;

  v_validacao := public.fn_conferencia_validar_onda(p_tenant_id, p_empresa_id, p_usuario_id, p_movimento_saida_id);
  IF NOT (v_validacao ->> 'permitido')::boolean THEN
    RAISE EXCEPTION '%: %', v_validacao ->> 'codigo', v_validacao ->> 'mensagem';
  END IF;

  -- Reservas abandonadas de outros operadores voltam para a fila (regra do tipo SEP-CONF)
  IF COALESCE((v_validacao ->> 'reservas_expiradas')::integer, 0) > 0 THEN
    PERFORM public.fn_tarefa_liberar_reservas_expiradas(
      p_tenant_id, p_movimento_saida_id, p_usuario_id, 'COLETOR_INICIO', ARRAY['SEP-CONF'], false);
  END IF;

  v_reserva_mov := COALESCE((v_validacao ->> 'reserva_movimento')::boolean, true);

  SELECT u.zona_atividade_separacao INTO v_zona_usuario
  FROM usuario u WHERE u.id = p_usuario_id AND u.tenant_id = p_tenant_id;

  IF v_reserva_mov THEN
    -- MODO MOVIMENTO: atribuir todas as tarefas pendentes (da zona do operador)
    SELECT array_agg(t.id ORDER BY t.ordem_tarefa)
      INTO v_tarefa_ids
    FROM tarefa t
    JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem
    JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id
    WHERE tt.codigo = 'SEP-CONF'
      AND t.tenant_id = p_tenant_id
      AND t.status IN ('CRIADA'::enum_status_tarefa, 'ATRIBUIDA'::enum_status_tarefa, 'EM_ANDAMENTO'::enum_status_tarefa)
      AND msi.movimento_saida_id = p_movimento_saida_id
      AND t.quantidade_requerida > COALESCE(t.quantidade_executada, 0)
      AND (
          v_zona_usuario IS NULL
          OR EXISTS (
              SELECT 1 FROM endereco_zona_atividade eza
              WHERE eza.endereco_id = t.id_local_origem
                AND eza.zona_atividade_id = v_zona_usuario
                AND eza.tenant_id = p_tenant_id
          )
      );
  ELSE
    -- MODO TAREFA: 1 tarefa livre
    SELECT array_agg(sub.id)
      INTO v_tarefa_ids
    FROM (
        SELECT t.id
        FROM tarefa t
        JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem
        JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id
        WHERE tt.codigo = 'SEP-CONF'
          AND t.tenant_id = p_tenant_id
          AND t.status = 'CRIADA'::enum_status_tarefa
          AND msi.movimento_saida_id = p_movimento_saida_id
          AND t.quantidade_requerida > COALESCE(t.quantidade_executada, 0)
          AND NOT EXISTS (
              SELECT 1 FROM tarefa_atribuicao ta
              WHERE ta.tarefa_id = t.id AND ta.status = 'ATRIBUIDA'
          )
          AND (
              v_zona_usuario IS NULL
              OR EXISTS (
                  SELECT 1 FROM endereco_zona_atividade eza
                  WHERE eza.endereco_id = t.id_local_origem
                    AND eza.zona_atividade_id = v_zona_usuario
                    AND eza.tenant_id = p_tenant_id
              )
          )
        ORDER BY t.ordem_tarefa
        FOR UPDATE SKIP LOCKED
        LIMIT 1
    ) sub;
  END IF;

  IF v_tarefa_ids IS NOT NULL THEN
    -- Reativa atribuição antiga do mesmo operador (unique tarefa_id + usuario_id)
    INSERT INTO tarefa_atribuicao (tenant_id, empresa_id, tarefa_id, usuario_id, tipo_convocacao, status)
    SELECT p_tenant_id, p_empresa_id, unnest(v_tarefa_ids), p_usuario_id, 'AUTO_CONVOCADO', 'ATRIBUIDA'
    ON CONFLICT ON CONSTRAINT uq_tarefa_atribuicao_tarefa_usuario DO UPDATE
      SET status = 'ATRIBUIDA', atribuido_em = now(), liberado_em = NULL
      WHERE tarefa_atribuicao.status <> 'ATRIBUIDA';

    UPDATE tarefa t
    SET status = 'ATRIBUIDA'
    WHERE t.id = ANY(v_tarefa_ids)
      AND t.tenant_id = p_tenant_id
      AND t.status = 'CRIADA'::enum_status_tarefa;
  END IF;

  -- Nada atribuído agora e nada já meu -> não mexe no status da onda
  IF NOT EXISTS (
    SELECT 1
    FROM tarefa t
    JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem
    JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id AND tt.codigo = 'SEP-CONF'
    JOIN tarefa_atribuicao ta ON ta.tarefa_id = t.id AND ta.usuario_id = p_usuario_id
                             AND ta.status = 'ATRIBUIDA' AND ta.tenant_id = p_tenant_id
    WHERE msi.movimento_saida_id = p_movimento_saida_id
      AND t.tenant_id = p_tenant_id
      AND t.status IN ('ATRIBUIDA'::enum_status_tarefa, 'EM_ANDAMENTO'::enum_status_tarefa)
  ) THEN
    RAISE EXCEPTION 'CONF_SEM_TAREFAS: Nenhuma tarefa de conferência disponível para você nesta onda.';
  END IF;

  UPDATE movimento_saida ms
  SET status = 'EM_CONFERENCIA'::enum_status_onda_carregamento
  WHERE ms.id = p_movimento_saida_id
    AND ms.tenant_id = p_tenant_id
    AND ms.status = 'SEPARADO'::enum_status_onda_carregamento;

  RETURN QUERY
  SELECT
      t.id,
      t.id AS tarefa_id,
      t.produto_id,
      t.ordem_tarefa::integer,
      p.sku,
      p.descricao,
      p.fator_caixa::numeric,
      t.quantidade_requerida::numeric,
      COALESCE(t.quantidade_executada, 0)::numeric AS conferido,
      t.status::text
  FROM tarefa t
  JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem
  JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id
  JOIN produto p ON p.id = t.produto_id
  WHERE msi.movimento_saida_id = p_movimento_saida_id
    AND t.tenant_id = p_tenant_id
    AND t.status IN ('CRIADA'::enum_status_tarefa, 'ATRIBUIDA'::enum_status_tarefa, 'EM_ANDAMENTO'::enum_status_tarefa)
    AND EXISTS (
        SELECT 1 FROM tarefa_atribuicao ta2
        WHERE ta2.tarefa_id = t.id
          AND ta2.usuario_id = p_usuario_id
          AND ta2.status = 'ATRIBUIDA'
          AND ta2.tenant_id = p_tenant_id
    )
  ORDER BY t.ordem_tarefa;
END;
$function$;

REVOKE ALL ON FUNCTION public.conferencia_buscar_tarefas(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conferencia_buscar_tarefas(uuid, uuid, uuid, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
