-- =====================================================================
-- ENSAIO EM PRODUÇÃO (tudo é desfeito) · 20261112100000_tarefa_reserva_expiracao_por_tipo
-- Aplica a migration e roda a 1ª rodada do cron na MESMA transação; o RAISE
-- final desfaz tudo. Resultado: "ENSAIO OK/FALHOU (desfeito): ...".
-- =====================================================================
-- 0. Limpeza das versões anteriores (só existiam no QA) -----------------
DROP FUNCTION IF EXISTS public.fn_conferencia_liberar_reservas_expiradas(uuid, uuid, uuid, integer, text);
DROP FUNCTION IF EXISTS public.fn_conferencia_reservas_onda(uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.fn_conferencia_reserva_expira_min(uuid, uuid);
ALTER TABLE public.armazem_config DROP COLUMN IF EXISTS conferencia_reserva_expira_min;
DROP FUNCTION IF EXISTS public.fn_tarefa_liberar_reservas_expiradas(uuid, uuid, uuid, text, text[], boolean);
DROP FUNCTION IF EXISTS public.fn_tarefa_reservas_status(uuid, uuid, text[]);
DROP TABLE IF EXISTS public.tarefa_reserva_liberacao;

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
  'Atribuição sem atividade: LIBERAR | LIBERAR_SEM_EXECUCAO | ALERTAR | NUNCA (permitidas: fn_tipo_tarefa_reserva_acoes)';
COMMENT ON COLUMN public.tipo_tarefa.reserva_expira_min IS
  'Minutos sem atividade do operador para a reserva expirar (15 a 10080). Padrão 240.';

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

-- 3. Situação das reservas abertas ------------------------------------
CREATE OR REPLACE FUNCTION public.fn_tarefa_reservas_status(
  p_tenant_id uuid, p_grupo_id uuid DEFAULT NULL, p_tipos text[] DEFAULT NULL
)
RETURNS TABLE(
  atribuicao_id uuid, atribuicao_status text, tipo_convocacao text, designado_gestor boolean,
  tarefa_id uuid, tipo_tarefa_codigo text, empresa_id uuid, grupo_id uuid,
  usuario_id uuid, usuario_nome text, atribuido_em timestamptz, ultima_atividade timestamptz,
  acao text, expira_min integer, expirada boolean, tem_execucao boolean, liberavel boolean, alertavel boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT ta.id AS atribuicao_id, ta.status AS atribuicao_status, ta.tipo_convocacao::text AS tipo_convocacao,
           ta.usuario_id, ta.atribuido_em,
           t.id AS tarefa_id, t.empresa_id, t.tipo_tarefa_id, tt.codigo, tt.reserva_acao, tt.reserva_expira_min,
           CASE WHEN msi.id IS NOT NULL THEN 'SAIDA' WHEN mei.id IS NOT NULL THEN 'ENTRADA' ELSE 'OUTRO' END AS grupo_tipo,
           COALESCE(msi.movimento_saida_id, mei.movimento_entrada_id, t.id_documento_origem, t.id) AS grupo_id,
           (COALESCE(t.quantidade_executada, 0) > 0 OR EXISTS (
              SELECT 1 FROM tarefa_execucao te0
              WHERE te0.tarefa_id = t.id AND te0.status::text <> 'CANCELADA')) AS tem_execucao,
           (ta.tipo_convocacao::text = 'CONVOCACAO_GESTOR' OR (msi.id IS NOT NULL AND EXISTS (
              SELECT 1 FROM movimento_saida_responsavel r
              WHERE r.movimento_saida_id = msi.movimento_saida_id AND r.tipo_tarefa_id = t.tipo_tarefa_id
                AND r.usuario_id = ta.usuario_id AND r.ativo))) AS designado_gestor
    FROM tarefa_atribuicao ta
    JOIN tarefa t       ON t.id = ta.tarefa_id AND t.tenant_id = p_tenant_id
    JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id
    LEFT JOIN movimento_saida_item msi
           ON t.tipo_documento_origem = 'MOVIMENTO_SAIDA_ITEM' AND msi.id = t.id_documento_origem
    LEFT JOIN movimento_entrada_item mei
           ON t.tipo_documento_origem = 'MOVIMENTO_ENTRADA_ITEM' AND mei.id = t.id_documento_origem
    WHERE ta.tenant_id = p_tenant_id
      AND ta.liberado_em IS NULL
      AND ta.status IN ('ATRIBUIDA', 'ATIVO', 'COLETA_PENDENTE')
      AND t.status::text IN ('ATRIBUIDA', 'EM_ANDAMENTO', 'PAUSADA')
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
  ), calc AS (
    SELECT b.*, u.nome::text AS usuario_nome,
           GREATEST(a.ult_atrib, a.ult_exec) AS ultima,
           GREATEST(a.ult_atrib, a.ult_exec) < now() - make_interval(mins => b.reserva_expira_min) AS expirada
    FROM base b
    JOIN ativ a ON a.usuario_id = b.usuario_id AND a.tipo_tarefa_id = b.tipo_tarefa_id AND a.grupo_id = b.grupo_id
    LEFT JOIN usuario u ON u.id = b.usuario_id
  ), regra AS (
    SELECT c.*,
           (c.expirada
            AND NOT c.designado_gestor
            AND c.atribuicao_status IN ('ATRIBUIDA', 'ATIVO')
            AND (c.reserva_acao = 'LIBERAR'
                 OR (c.reserva_acao = 'LIBERAR_SEM_EXECUCAO' AND NOT c.tem_execucao))) AS pode_liberar
    FROM calc c
  )
  SELECT r.atribuicao_id, r.atribuicao_status, r.tipo_convocacao, r.designado_gestor,
         r.tarefa_id, r.codigo, r.empresa_id, r.grupo_id,
         r.usuario_id, r.usuario_nome, r.atribuido_em, r.ultima,
         r.reserva_acao, r.reserva_expira_min, r.expirada, r.tem_execucao,
         r.pode_liberar,
         (r.expirada AND NOT r.pode_liberar)
  FROM regra r;
$function$;

REVOKE ALL ON FUNCTION public.fn_tarefa_reservas_status(uuid, uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_tarefa_reservas_status(uuid, uuid, text[]) TO service_role;

-- 4. Liberação (igual a "Sair da etapa") e aviso -----------------------
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
  v_liberadas integer := 0;
  v_reabertas integer := 0;
  v_alertas   integer := 0;
  v_n         integer;
  r           record;
BEGIN
  FOR r IN
    SELECT s.* FROM public.fn_tarefa_reservas_status(p_tenant_id, p_grupo_id, p_tipos) s
    WHERE s.liberavel AND s.usuario_id IS DISTINCT FROM p_usuario_excecao
  LOOP
    -- Trava a tarefa sem esperar: se o operador estiver mexendo agora, fica para a próxima rodada
    PERFORM 1 FROM tarefa t WHERE t.id = r.tarefa_id FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN CONTINUE; END IF;

    UPDATE tarefa_atribuicao
       SET status = 'LIBERADA',
           liberado_em = now(),
           motivo_liberacao = 'DEVOLUCAO_FILA',
           observacao = concat_ws(' | ', NULLIF(observacao, ''),
                          format('Reserva expirada (%s): sem atividade desde %s, limite %s min.',
                                 p_origem, to_char(r.ultima_atividade AT TIME ZONE 'America/Fortaleza', 'DD/MM/YYYY HH24:MI'), r.expira_min))
     WHERE id = r.atribuicao_id
       AND liberado_em IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN CONTINUE; END IF;
    v_liberadas := v_liberadas + 1;

    UPDATE tarefa SET status = 'CRIADA' WHERE id = r.tarefa_id AND status = 'ATRIBUIDA';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_reabertas := v_reabertas + v_n;

    INSERT INTO tarefa_evento_execucao (tenant_id, tarefa_id, tipo_evento, carga_util)
    VALUES (p_tenant_id, r.tarefa_id, 'REATRIBUICAO',
            jsonb_build_object('origem', 'SISTEMA', 'acao', 'EXPIRACAO_RESERVA', 'gatilho', p_origem,
                               'de', r.usuario_id, 'para', NULL, 'tipo_tarefa', r.tipo_tarefa_codigo,
                               'grupo_id', r.grupo_id, 'ultima_atividade', r.ultima_atividade,
                               'expira_min', r.expira_min, 'com_progresso', r.tem_execucao));
  END LOOP;

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
                format('%s tarefa(s) (%s) paradas com operador sem atividade desde %s (designadas pelo gestor ou com produto na mão). Verifique com o operador antes de liberar.',
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

-- 5. Cron (a cada 10 min) ---------------------------------------------
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


DO $$
DECLARE
  log text := ''; falhas int := 0; n int; s text; v jsonb; t0 timestamptz;
BEGIN
  -- 1. Padrões e trava
  SELECT count(*) INTO n FROM tipo_tarefa WHERE reserva_acao <> fn_tipo_tarefa_reserva_acao_padrao(codigo);
  log := log || E'\n01 tipos fora do padrão => 0 : ' || n; IF n<>0 THEN falhas:=falhas+1; log:=log||' <<FALHA'; END IF;
  BEGIN
    UPDATE tipo_tarefa SET reserva_acao='LIBERAR' WHERE codigo='PED-CAN';
    falhas:=falhas+1; log := log || E'\n02 PED-CAN=LIBERAR aceito <<FALHA';
  EXCEPTION WHEN OTHERS THEN log := log || E'\n02 PED-CAN=LIBERAR recusado'; END;

  -- 2. Situação antes (todos os tenants ativos)
  CREATE TEMP TABLE _antes ON COMMIT DROP AS
    SELECT s.* FROM tenant tn CROSS JOIN LATERAL fn_tarefa_reservas_status(tn.id) s WHERE tn.ativo;
  SELECT string_agg(x, ' | ') INTO s FROM (
    SELECT tipo_tarefa_codigo || ': abertas ' || count(*) || ', liberar ' || count(*) FILTER (WHERE liberavel)
           || ', avisar ' || count(*) FILTER (WHERE alertavel) || ' (gestor ' || count(*) FILTER (WHERE alertavel AND designado_gestor)
           || ', coleta pend. ' || count(*) FILTER (WHERE alertavel AND atribuicao_status='COLETA_PENDENTE') || ')' x
    FROM _antes GROUP BY tipo_tarefa_codigo ORDER BY 1) q;
  log := log || E'\n03 antes: ' || coalesce(s, 'nenhuma reserva aberta');
  SELECT count(*) INTO n FROM _antes WHERE liberavel AND (designado_gestor OR atribuicao_status='COLETA_PENDENTE');
  log := log || E'\n04 liberável com gestor/coleta pendente => 0 : ' || n; IF n<>0 THEN falhas:=falhas+1; log:=log||' <<FALHA'; END IF;
  SELECT count(*) INTO n FROM _antes WHERE liberavel AND acao='LIBERAR_SEM_EXECUCAO' AND tem_execucao;
  log := log || E'\n05 separação com coleta liberável => 0 : ' || n; IF n<>0 THEN falhas:=falhas+1; log:=log||' <<FALHA'; END IF;

  -- 3. 1ª rodada do cron
  t0 := clock_timestamp();
  v := cron_liberar_reservas_tarefas();
  log := log || E'\n06 cron em ' || round(extract(epoch from clock_timestamp()-t0)*1000) || ' ms: ' || left(v::text, 400);
  SELECT count(*) INTO n FROM _antes a JOIN tarefa_atribuicao ta ON ta.id=a.atribuicao_id
   WHERE a.liberavel AND NOT (ta.status='LIBERADA' AND ta.motivo_liberacao='DEVOLUCAO_FILA' AND ta.liberado_em IS NOT NULL);
  log := log || E'\n07 liberáveis não liberadas => 0 : ' || n; IF n<>0 THEN falhas:=falhas+1; log:=log||' <<FALHA'; END IF;
  SELECT count(*) INTO n FROM _antes a JOIN tarefa_atribuicao ta ON ta.id=a.atribuicao_id WHERE NOT a.liberavel AND ta.liberado_em IS NOT NULL AND ta.motivo_liberacao='DEVOLUCAO_FILA' AND ta.observacao ILIKE '%Reserva expirada%';
  log := log || E'\n08 não liberáveis liberadas => 0 : ' || n; IF n<>0 THEN falhas:=falhas+1; log:=log||' <<FALHA'; END IF;
  SELECT count(*) INTO n FROM tarefa_evento_execucao WHERE tipo_evento='REATRIBUICAO' AND carga_util->>'acao'='EXPIRACAO_RESERVA';
  log := log || E'\n09 eventos EXPIRACAO_RESERVA = liberadas : ' || n || ' / ' || (SELECT count(*) FROM _antes WHERE liberavel);
  IF n <> (SELECT count(*) FROM _antes WHERE liberavel) THEN falhas:=falhas+1; log:=log||' <<FALHA'; END IF;
  SELECT count(*) INTO n FROM (SELECT tarefa_id FROM tarefa_atribuicao WHERE liberado_em IS NULL GROUP BY 1 HAVING count(*)>1) x;
  log := log || E'\n10 tarefas com 2 donos abertos => 0 : ' || n; IF n<>0 THEN falhas:=falhas+1; log:=log||' <<FALHA'; END IF;
  SELECT count(*) INTO n FROM notificacao_painel WHERE tipo='RESERVA_TAREFA_PARADA' AND criado_em > now() - interval '1 minute';
  log := log || E'\n11 avisos criados: ' || n;
  v := cron_liberar_reservas_tarefas();
  log := log || E'\n12 2ª rodada (nada a liberar): ' || left(v::text, 200);
  IF v->'resultados' <> '[]'::jsonb THEN falhas:=falhas+1; log:=log||' <<FALHA'; END IF;

  -- 4. Onda #2304 (reserva parada desde 09/11) volta a aparecer para outro operador
  BEGIN
    v := fn_conferencia_validar_onda('ba39e14e-0e6a-40d3-8a7c-ef0813c602b9', '42e67893-1bb3-48a1-8cbc-abd333c05199',
                                     'a9abb881-c100-4e6f-92af-c371b00cf2ec', '37b6c13e-954b-4c30-a64e-6cc1eb4ed60e');
    log := log || E'\n13 onda 2304 para outro operador: ' || (v->>'codigo') || ' ' || left(coalesce(v->>'mensagem',''), 80);
    IF v->>'codigo' = 'CONF_ONDA_RESERVADA' THEN falhas:=falhas+1; log:=log||' <<FALHA'; END IF;
  EXCEPTION WHEN OTHERS THEN log := log || E'\n13 validador: ' || left(SQLERRM,100); END;

  SELECT count(*) INTO n FROM cron.job WHERE jobname='cron_liberar_reservas_tarefas' AND schedule='*/10 * * * *';
  log := log || E'\n14 cron agendado => 1 : ' || n; IF n<>1 THEN falhas:=falhas+1; log:=log||' <<FALHA'; END IF;

  RAISE EXCEPTION 'ENSAIO % (desfeito): % falha(s)%', CASE WHEN falhas=0 THEN 'OK' ELSE 'FALHOU' END, falhas, log;
END $$;
