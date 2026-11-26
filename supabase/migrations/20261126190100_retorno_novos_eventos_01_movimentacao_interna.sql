-- =====================================================================
-- 2026-11-26 · Retorno ao ERP · novos eventos (01/03) — movimentação interna
--
-- Cenário B do plano: transferência (coletor) e mudança de picking cujo
-- endereço de destino tem ARMAZÉM, SETOR ou TIPO DE ESTOQUE diferente do de
-- origem viram uma "movimentação interna" e disparam o evento
-- estoque.estrutura_alterada para o ERP refletir a troca na estrutura dele.
--
-- Nenhuma RPC existente foi alterada. A detecção fica num gatilho em
-- estoque_movimento (o razão imutável de estoque):
--   * só tarefa TRANF; rotina pela tarefa.tipo_documento_origem:
--       'MUDANCA_PICKING' -> MUDANCA_PICKING (rpc_mudanca_picking_executar)
--       NULL              -> TRANSFERENCIA   (rpc_transferencia_confirmar)
--     (outros valores, ex. TRANSFERENCIA_PICKING_MASSA, ficam de fora)
--   * agrupa por transação + origem + destino + empresa: a mudança de picking
--     que move N produtos gera UMA movimentação com N itens.
--   * registra sempre (auditoria e reenvio); o evento só é emitido no commit e
--     só se a empresa tiver fluxo ativo para ele.
--   * nada bloqueia a operação: falha vira WARNING / retorno_evento erro_contexto.
-- Estorno: transferência e mudança de picking não têm estorno no WMS
-- (estorno_da_execucao_id só existe na saída), por isso não há evento de estorno.
--
-- Também: setor.codigo_erp (armazém e tipo de estoque já tinham).
-- Reverter: supabase/rollback/20261126_retorno_novos_eventos_reverter.sql
-- =====================================================================

-- ---------- 1. setor.codigo_erp ----------
ALTER TABLE public.setor ADD COLUMN IF NOT EXISTS codigo_erp text;
CREATE INDEX IF NOT EXISTS idx_setor_tenant_codigo_erp ON public.setor (tenant_id, codigo_erp) WHERE codigo_erp IS NOT NULL;
COMMENT ON COLUMN public.setor.codigo_erp IS 'Código do setor no ERP (usado no retorno ao ERP de movimentações internas).';

-- ---------- 2. tabelas ----------
CREATE TABLE IF NOT EXISTS public.movimentacao_interna (
  id                       uuid        NOT NULL DEFAULT gen_random_uuid(),
  tenant_id                uuid        NOT NULL REFERENCES public.tenant(id),
  empresa_id               uuid        NOT NULL REFERENCES public.empresa(id),
  numero                   bigint      GENERATED ALWAYS AS IDENTITY,
  rotina                   text        NOT NULL CHECK (rotina IN ('TRANSFERENCIA', 'MUDANCA_PICKING')),
  transacao_id             bigint      NOT NULL,
  usuario_id               uuid        REFERENCES public.usuario(id),
  endereco_origem_id       uuid        NOT NULL REFERENCES public.endereco(id),
  endereco_destino_id      uuid        NOT NULL REFERENCES public.endereco(id),
  armazem_origem_id        uuid        REFERENCES public.armazem(id),
  armazem_destino_id       uuid        REFERENCES public.armazem(id),
  setor_origem_id          uuid        REFERENCES public.setor(id),
  setor_destino_id         uuid        REFERENCES public.setor(id),
  tipo_estoque_origem_id   uuid        REFERENCES public.tipo_estoque(id),
  tipo_estoque_destino_id  uuid        REFERENCES public.tipo_estoque(id),
  muda_armazem             boolean     NOT NULL,
  muda_setor               boolean     NOT NULL,
  muda_tipo_estoque        boolean     NOT NULL,
  ocorrida_em              timestamptz NOT NULL DEFAULT now(),
  integracao_status        text        NOT NULL DEFAULT 'nao_enviado'
                           CHECK (integracao_status IN ('nao_enviado', 'pendente', 'integrado', 'erro', 'ignorado')),
  integracao_mensagem      text,
  integracao_atualizado_em timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  created_by               uuid        REFERENCES public.usuario(id),
  CONSTRAINT movimentacao_interna_pkey PRIMARY KEY (id),
  CONSTRAINT movimentacao_interna_numero_uk UNIQUE (numero),
  CONSTRAINT movimentacao_interna_transacao_uk
    UNIQUE (tenant_id, empresa_id, transacao_id, endereco_origem_id, endereco_destino_id, rotina)
);
COMMENT ON TABLE public.movimentacao_interna IS
  'Transferência/mudança de picking que trocou armazém, setor ou tipo de estoque. Gravada só pelo gatilho trg_zz_movimentacao_interna (estoque_movimento); fonte do evento de retorno estoque.estrutura_alterada.';

CREATE TABLE IF NOT EXISTS public.movimentacao_interna_item (
  id                       uuid        NOT NULL DEFAULT gen_random_uuid(),
  tenant_id                uuid        NOT NULL REFERENCES public.tenant(id),
  movimentacao_interna_id  uuid        NOT NULL REFERENCES public.movimentacao_interna(id) ON DELETE CASCADE,
  estoque_movimento_id     uuid        REFERENCES public.estoque_movimento(id) ON DELETE SET NULL,
  tarefa_execucao_id       uuid        REFERENCES public.tarefa_execucao(id) ON DELETE SET NULL,
  produto_id               uuid        NOT NULL REFERENCES public.produto(id),
  lote                     text,
  data_validade            date,
  data_fabricacao          date,
  numero_serie             text,
  hu_id                    uuid        REFERENCES public.hu(id),
  quantidade               numeric     NOT NULL,
  saldo_posterior_origem   numeric,
  saldo_posterior_destino  numeric,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT movimentacao_interna_item_pkey PRIMARY KEY (id),
  CONSTRAINT movimentacao_interna_item_mov_uk UNIQUE (estoque_movimento_id)
);

CREATE INDEX IF NOT EXISTS idx_movimentacao_interna_tenant_id   ON public.movimentacao_interna (tenant_id);
CREATE INDEX IF NOT EXISTS idx_movimentacao_interna_empresa_id  ON public.movimentacao_interna (empresa_id);
CREATE INDEX IF NOT EXISTS idx_movimentacao_interna_lista       ON public.movimentacao_interna (tenant_id, empresa_id, ocorrida_em DESC);
CREATE INDEX IF NOT EXISTS idx_movimentacao_interna_end_origem  ON public.movimentacao_interna (endereco_origem_id);
CREATE INDEX IF NOT EXISTS idx_movimentacao_interna_end_destino ON public.movimentacao_interna (endereco_destino_id);
CREATE INDEX IF NOT EXISTS idx_movimentacao_interna_usuario     ON public.movimentacao_interna (usuario_id);
CREATE INDEX IF NOT EXISTS idx_movimentacao_interna_created_by  ON public.movimentacao_interna (created_by);
CREATE INDEX IF NOT EXISTS idx_movimentacao_interna_arm_origem  ON public.movimentacao_interna (armazem_origem_id);
CREATE INDEX IF NOT EXISTS idx_movimentacao_interna_arm_destino ON public.movimentacao_interna (armazem_destino_id);
CREATE INDEX IF NOT EXISTS idx_movimentacao_interna_set_origem  ON public.movimentacao_interna (setor_origem_id);
CREATE INDEX IF NOT EXISTS idx_movimentacao_interna_set_destino ON public.movimentacao_interna (setor_destino_id);
CREATE INDEX IF NOT EXISTS idx_movimentacao_interna_te_origem   ON public.movimentacao_interna (tipo_estoque_origem_id);
CREATE INDEX IF NOT EXISTS idx_movimentacao_interna_te_destino  ON public.movimentacao_interna (tipo_estoque_destino_id);
CREATE INDEX IF NOT EXISTS idx_movimentacao_interna_item_tenant ON public.movimentacao_interna_item (tenant_id);
CREATE INDEX IF NOT EXISTS idx_movimentacao_interna_item_mov    ON public.movimentacao_interna_item (movimentacao_interna_id);
CREATE INDEX IF NOT EXISTS idx_movimentacao_interna_item_prod   ON public.movimentacao_interna_item (produto_id);
CREATE INDEX IF NOT EXISTS idx_movimentacao_interna_item_exec   ON public.movimentacao_interna_item (tarefa_execucao_id);
CREATE INDEX IF NOT EXISTS idx_movimentacao_interna_item_hu     ON public.movimentacao_interna_item (hu_id);

DROP TRIGGER IF EXISTS trg_movimentacao_interna_updated_at ON public.movimentacao_interna;
CREATE TRIGGER trg_movimentacao_interna_updated_at BEFORE UPDATE ON public.movimentacao_interna
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_movimentacao_interna_item_updated_at ON public.movimentacao_interna_item;
CREATE TRIGGER trg_movimentacao_interna_item_updated_at BEFORE UPDATE ON public.movimentacao_interna_item
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: leitura por tenant; escrita só pelos gatilhos (SECURITY DEFINER)
ALTER TABLE public.movimentacao_interna ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimentacao_interna_item ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS movimentacao_interna_tenant_select ON public.movimentacao_interna;
CREATE POLICY movimentacao_interna_tenant_select ON public.movimentacao_interna
  FOR SELECT TO authenticated USING (tenant_id = (SELECT public.get_current_tenant()));
DROP POLICY IF EXISTS movimentacao_interna_item_tenant_select ON public.movimentacao_interna_item;
CREATE POLICY movimentacao_interna_item_tenant_select ON public.movimentacao_interna_item
  FOR SELECT TO authenticated USING (tenant_id = (SELECT public.get_current_tenant()));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.movimentacao_interna, public.movimentacao_interna_item FROM anon, authenticated;
REVOKE ALL ON public.movimentacao_interna, public.movimentacao_interna_item FROM anon;
GRANT SELECT ON public.movimentacao_interna, public.movimentacao_interna_item TO authenticated;

-- ---------- 3. catálogo ----------
INSERT INTO integracao.retorno_evento_catalogo (codigo, entidade, origem_tabela, status_origem, nome, descricao, ordem, ativo) VALUES
 ('estoque.estrutura_alterada', 'movimentacao_interna', 'movimentacao_interna', 'ESTRUTURA_ALTERADA',
  'Estoque · Mudou de armazém, setor ou tipo de estoque',
  'Transferência ou mudança de picking em que o destino tem armazém, setor ou tipo de estoque diferente da origem. Traz origem, destino, itens e os indicadores movimentacao.muda_armazem, muda_setor e muda_tipo_estoque para filtrar no gatilho.',
  400, true)
ON CONFLICT (codigo) DO UPDATE SET nome = EXCLUDED.nome, descricao = EXCLUDED.descricao, ordem = EXCLUDED.ordem,
  entidade = EXCLUDED.entidade, origem_tabela = EXCLUDED.origem_tabela, status_origem = EXCLUDED.status_origem, ativo = true;

-- ---------- 4. registro (gatilho em estoque_movimento) ----------
CREATE OR REPLACE FUNCTION integracao.trg_movimentacao_interna_registrar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'integracao'
AS $function$
DECLARE
  v_codigo  text;
  v_doc     text;
  v_rotina  text;
  o         record;
  d         record;
  v_tx      bigint;
  v_id      uuid;
BEGIN
  BEGIN
    SELECT tt.codigo, t.tipo_documento_origem INTO v_codigo, v_doc
      FROM tarefa_execucao te
      JOIN tarefa t ON t.id = te.tarefa_id
      JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id
     WHERE te.id = NEW.tarefa_execucao_id;
    IF v_codigo IS DISTINCT FROM 'TRANF' THEN RETURN NULL; END IF;
    v_rotina := CASE WHEN v_doc = 'MUDANCA_PICKING' THEN 'MUDANCA_PICKING'
                     WHEN v_doc IS NULL THEN 'TRANSFERENCIA' END;
    IF v_rotina IS NULL THEN RETURN NULL; END IF;

    SELECT e.armazem_id, e.setor_id, e.tipo_estoque_id INTO o FROM endereco e WHERE e.id = NEW.endereco_origem_id;
    SELECT e.armazem_id, e.setor_id, e.tipo_estoque_id INTO d FROM endereco e WHERE e.id = NEW.endereco_destino_id;
    IF o.armazem_id IS NOT DISTINCT FROM d.armazem_id
       AND o.setor_id IS NOT DISTINCT FROM d.setor_id
       AND o.tipo_estoque_id IS NOT DISTINCT FROM d.tipo_estoque_id THEN
      RETURN NULL;
    END IF;

    v_tx := pg_current_xact_id()::text::bigint;
    -- Procura antes de inserir: ON CONFLICT gastaria um número da sequência a cada item.
    SELECT mi.id INTO v_id FROM movimentacao_interna mi
     WHERE mi.tenant_id = NEW.tenant_id AND mi.empresa_id = NEW.empresa_id AND mi.transacao_id = v_tx
       AND mi.endereco_origem_id = NEW.endereco_origem_id AND mi.endereco_destino_id = NEW.endereco_destino_id
       AND mi.rotina = v_rotina;
    IF v_id IS NULL THEN
      INSERT INTO movimentacao_interna (tenant_id, empresa_id, rotina, transacao_id, usuario_id,
        endereco_origem_id, endereco_destino_id, armazem_origem_id, armazem_destino_id,
        setor_origem_id, setor_destino_id, tipo_estoque_origem_id, tipo_estoque_destino_id,
        muda_armazem, muda_setor, muda_tipo_estoque, created_by)
      VALUES (NEW.tenant_id, NEW.empresa_id, v_rotina, v_tx, NEW.usuario_id,
        NEW.endereco_origem_id, NEW.endereco_destino_id, o.armazem_id, d.armazem_id,
        o.setor_id, d.setor_id, o.tipo_estoque_id, d.tipo_estoque_id,
        o.armazem_id IS DISTINCT FROM d.armazem_id, o.setor_id IS DISTINCT FROM d.setor_id,
        o.tipo_estoque_id IS DISTINCT FROM d.tipo_estoque_id, NEW.usuario_id)
      RETURNING id INTO v_id;
    END IF;

    INSERT INTO movimentacao_interna_item (tenant_id, movimentacao_interna_id, estoque_movimento_id, tarefa_execucao_id,
      produto_id, lote, data_validade, data_fabricacao, numero_serie, hu_id, quantidade,
      saldo_posterior_origem, saldo_posterior_destino)
    VALUES (NEW.tenant_id, v_id, NEW.id, NEW.tarefa_execucao_id,
      NEW.produto_id, NULLIF(NEW.lote, ''), NULLIF(NEW.data_validade, DATE '1900-01-01'),
      NULLIF(NEW.data_fabricacao, DATE '1900-01-01'), NULLIF(NEW.numero_serie, ''),
      NULLIF(NEW.hu_id, '00000000-0000-0000-0000-000000000000'::uuid), NEW.quantidade,
      NEW.saldo_posterior_origem, NEW.saldo_posterior_destino)
    ON CONFLICT ON CONSTRAINT movimentacao_interna_item_mov_uk DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[retorno] movimentação interna não registrada (estoque_movimento %): % %', NEW.id, SQLSTATE, SQLERRM;
  END;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION integracao.trg_movimentacao_interna_registrar() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_zz_movimentacao_interna ON public.estoque_movimento;
CREATE TRIGGER trg_zz_movimentacao_interna AFTER INSERT ON public.estoque_movimento
  FOR EACH ROW
  WHEN (NEW.tipo_movimento = 3 AND NEW.tarefa_execucao_id IS NOT NULL AND NEW.estorno_da_execucao_id IS NULL
        AND NEW.endereco_origem_id IS NOT NULL AND NEW.endereco_destino_id IS NOT NULL
        AND NEW.endereco_origem_id <> NEW.endereco_destino_id)
  EXECUTE FUNCTION integracao.trg_movimentacao_interna_registrar();

-- ---------- 5. contexto ----------
CREATE OR REPLACE FUNCTION integracao.fn_retorno_lado_estrutura(p_endereco_id uuid, p_armazem_id uuid, p_setor_id uuid, p_tipo_estoque_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'integracao'
AS $function$
  SELECT jsonb_build_object(
    'endereco', (SELECT jsonb_build_object('id', e.id, 'codigo', e.codigo_endereco, 'descricao', e.descricao,
                                           'rua', e.rua, 'predio', e.predio, 'nivel', e.nivel, 'apto', e.apto,
                                           'tipo_endereco', e.tipo_endereco::text)
                 FROM endereco e WHERE e.id = p_endereco_id),
    'armazem', (SELECT jsonb_build_object('id', a.id, 'codigo_erp', a.codigo_erp, 'descricao', a.descricao)
                FROM armazem a WHERE a.id = p_armazem_id),
    'setor', (SELECT jsonb_build_object('id', s.id, 'codigo_erp', s.codigo_erp, 'descricao', s.descricao, 'tipo', s.tipo::text)
              FROM setor s WHERE s.id = p_setor_id),
    'tipo_estoque', (SELECT jsonb_build_object('id', t.id, 'codigo_erp', t.codigo_erp, 'descricao', t.descricao, 'sigla', t.sigla)
                     FROM tipo_estoque t WHERE t.id = p_tipo_estoque_id));
$function$;
REVOKE ALL ON FUNCTION integracao.fn_retorno_lado_estrutura(uuid, uuid, uuid, uuid) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION integracao.fn_retorno_contexto_movimentacao(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'integracao'
AS $function$
DECLARE
  m        public.movimentacao_interna;
  v_numero text;
  v_itens  jsonb;
BEGIN
  SELECT * INTO m FROM public.movimentacao_interna WHERE id = p_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_numero := 'MI-' || lpad(m.numero::text, 6, '0');

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id,
           'produto', jsonb_build_object('id', p.id, 'sku', p.sku, 'codigo_erp', p.codigo_erp,
                                         'descricao', p.descricao, 'referencia', p.referencia),
           'lote', i.lote, 'validade', i.data_validade, 'fabricacao', i.data_fabricacao,
           'numero_serie', i.numero_serie,
           'hu', CASE WHEN h.id IS NULL THEN NULL ELSE jsonb_build_object('id', h.id, 'codigo', h.codigo_hu) END,
           'quantidade', i.quantidade,
           'saldo_origem_apos', i.saldo_posterior_origem,
           'saldo_destino_apos', i.saldo_posterior_destino) ORDER BY p.sku, i.lote, i.created_at), '[]'::jsonb)
    INTO v_itens
    FROM public.movimentacao_interna_item i
    JOIN public.produto p ON p.id = i.produto_id
    LEFT JOIN public.hu h ON h.id = i.hu_id
   WHERE i.movimentacao_interna_id = m.id;

  RETURN jsonb_build_object(
    'operador', (SELECT jsonb_build_object('id', u.id, 'login', u.login, 'nome', u.nome) FROM usuario u WHERE u.id = m.usuario_id),
    'documento', jsonb_build_object('id', m.id, 'numero', v_numero, 'direcao', 'interna'),
    'movimentacao', jsonb_build_object(
      'id', m.id, 'numero', v_numero, 'numero_seq', m.numero, 'rotina', m.rotina,
      'ocorrida_em', to_char(m.ocorrida_em AT TIME ZONE 'America/Fortaleza', 'YYYY-MM-DD"T"HH24:MI:SS"-03:00"'),
      'ocorrida_em_utc', m.ocorrida_em,
      'muda_armazem', m.muda_armazem, 'muda_setor', m.muda_setor, 'muda_tipo_estoque', m.muda_tipo_estoque,
      'mudancas', to_jsonb(array_remove(ARRAY[
                    CASE WHEN m.muda_armazem THEN 'armazem' END,
                    CASE WHEN m.muda_setor THEN 'setor' END,
                    CASE WHEN m.muda_tipo_estoque THEN 'tipo_estoque' END], NULL)),
      'integracao_status', m.integracao_status),
    'origem', fn_retorno_lado_estrutura(m.endereco_origem_id, m.armazem_origem_id, m.setor_origem_id, m.tipo_estoque_origem_id),
    'destino', fn_retorno_lado_estrutura(m.endereco_destino_id, m.armazem_destino_id, m.setor_destino_id, m.tipo_estoque_destino_id),
    'itens', v_itens,
    'totais', jsonb_build_object('itens', jsonb_array_length(v_itens),
                                 'quantidade', (SELECT coalesce(sum(i.quantidade), 0) FROM public.movimentacao_interna_item i
                                                WHERE i.movimentacao_interna_id = m.id)));
END;
$function$;
REVOKE ALL ON FUNCTION integracao.fn_retorno_contexto_movimentacao(uuid) FROM public, anon, authenticated;

-- ---------- 6. emissão (no commit) ----------
CREATE OR REPLACE FUNCTION integracao.fn_retorno_movimentacao_emitir(p_id uuid, p_evento text DEFAULT 'estoque.estrutura_alterada')
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'integracao'
AS $function$
DECLARE
  m           public.movimentacao_interna;
  v_ctx       jsonb;
  v_evento_id uuid;
  v_gat       jsonb;
  v_ok        boolean;
  v_numero    text;
  f           record;
BEGIN
  SELECT * INTO m FROM public.movimentacao_interna WHERE id = p_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM retorno_fluxo rf
                 WHERE rf.tenant_id = m.tenant_id AND rf.empresa_id = m.empresa_id AND rf.evento = p_evento
                   AND rf.ativo AND rf.versao_publicada IS NOT NULL) THEN
    RETURN NULL;
  END IF;
  BEGIN
    v_numero := 'MI-' || lpad(m.numero::text, 6, '0');
    v_ctx := fn_retorno_contexto('movimentacao_interna', p_id, p_evento, NULL);

    INSERT INTO retorno_evento (tenant_id, empresa_id, evento, entidade, documento_id, movimento_id, contexto, status, erro, disparado_por)
    VALUES (m.tenant_id, m.empresa_id, p_evento, 'movimentacao_interna', p_id, NULL, v_ctx,
            CASE WHEN v_ctx IS NULL THEN 'erro_contexto' ELSE 'roteado' END,
            CASE WHEN v_ctx IS NULL THEN 'Movimentação não encontrada ao montar o contexto' END,
            auth.uid())
    RETURNING id INTO v_evento_id;
    IF v_ctx IS NULL THEN RETURN v_evento_id; END IF;

    FOR f IN SELECT * FROM retorno_fluxo rf
             WHERE rf.tenant_id = m.tenant_id AND rf.empresa_id = m.empresa_id AND rf.evento = p_evento
               AND rf.ativo AND rf.versao_publicada IS NOT NULL
    LOOP
      v_gat := fn_retorno_no_gatilho(f.definicao_publicada);
      v_ok  := fn_retorno_avaliar_filtros(v_ctx, v_gat #> '{config,filtros}', v_gat #>> '{config,combinador}');
      INSERT INTO retorno_execucao (tenant_id, empresa_id, fluxo_id, fluxo_versao, evento_id, evento, entidade,
                                    documento_id, documento_numero, chave_ordenacao, modo, status, proximo_no,
                                    finalizado_em, erro, disparado_por)
      VALUES (m.tenant_id, m.empresa_id, f.id, f.versao_publicada, v_evento_id, p_evento, 'movimentacao_interna',
              p_id, v_numero, f.id || ':movimentacao_interna:' || p_id, 'automatico',
              CASE WHEN NOT v_ok THEN 'filtrado' WHEN f.modo_ativacao = 'agrupado' THEN 'agrupando' ELSE 'pendente' END,
              v_gat->>'id', CASE WHEN NOT v_ok THEN now() END,
              CASE WHEN NOT v_ok THEN 'Barrado pelos filtros do gatilho' END, 'evento')
      ON CONFLICT (evento_id, fluxo_id) WHERE evento_id IS NOT NULL DO NOTHING;
    END LOOP;
    RETURN v_evento_id;
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO retorno_evento (tenant_id, empresa_id, evento, entidade, documento_id, status, erro, disparado_por)
      VALUES (m.tenant_id, m.empresa_id, p_evento, 'movimentacao_interna', p_id, 'erro_contexto',
              left(SQLSTATE || ': ' || SQLERRM, 1000), auth.uid());
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[retorno] falha ao registrar % (%): %', p_evento, p_id, SQLERRM;
    END;
    RETURN NULL;
  END;
END;
$function$;
REVOKE ALL ON FUNCTION integracao.fn_retorno_movimentacao_emitir(uuid, text) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION integracao.trg_retorno_movimentacao_interna()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'integracao'
AS $function$
BEGIN
  BEGIN
    PERFORM fn_retorno_movimentacao_emitir(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[retorno] movimentação interna %: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION integracao.trg_retorno_movimentacao_interna() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_zz_retorno_movimentacao_interna ON public.movimentacao_interna;
CREATE CONSTRAINT TRIGGER trg_zz_retorno_movimentacao_interna AFTER INSERT ON public.movimentacao_interna
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION integracao.trg_retorno_movimentacao_interna();

-- ---------- 7. status de integração da movimentação ----------
CREATE OR REPLACE FUNCTION integracao._fn_movimentacao_integracao_recalcular(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'integracao'
AS $function$
DECLARE v_status text; v_msg text;
BEGIN
  WITH ult AS (
    SELECT DISTINCT ON (e.fluxo_id)
           e.status,
           coalesce(l.integracao_resultado, e.integracao_resultado) AS res,
           coalesce(l.integracao_mensagem, e.integracao_mensagem, e.erro) AS msg
      FROM integracao.retorno_execucao e
      LEFT JOIN integracao.retorno_execucao l ON l.id = e.lote_execucao_id
     WHERE e.entidade = 'movimentacao_interna' AND e.documento_id = p_id
       AND e.modo NOT IN ('teste', 'simulacao')
     ORDER BY e.fluxo_id, e.created_at DESC
  )
  SELECT CASE
           WHEN count(*) = 0 THEN 'nao_enviado'
           WHEN bool_or(status = 'erro' OR (status = 'sucesso' AND res = 'erro')) THEN 'erro'
           WHEN bool_or(status IN ('pendente', 'executando', 'aguardando_retry', 'agrupando', 'agrupado')) THEN 'pendente'
           WHEN bool_or(status = 'sucesso' AND coalesce(res, 'integrado') = 'integrado') THEN 'integrado'
           ELSE 'ignorado' END,
         max(msg) FILTER (WHERE status = 'erro' OR res = 'erro')
    INTO v_status, v_msg
    FROM ult;
  UPDATE public.movimentacao_interna
     SET integracao_status = v_status, integracao_mensagem = left(v_msg, 1000), integracao_atualizado_em = now()
   WHERE id = p_id
     AND (integracao_status IS DISTINCT FROM v_status OR integracao_mensagem IS DISTINCT FROM left(v_msg, 1000));
END;
$function$;
REVOKE ALL ON FUNCTION integracao._fn_movimentacao_integracao_recalcular(uuid) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION integracao.trg_retorno_execucao_movimentacao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'integracao'
AS $function$
BEGIN
  BEGIN
    PERFORM integracao._fn_movimentacao_integracao_recalcular(NEW.documento_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[retorno] status da movimentação % não recalculado: % %', NEW.documento_id, SQLSTATE, SQLERRM;
  END;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION integracao.trg_retorno_execucao_movimentacao() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_zz_retorno_execucao_movimentacao ON integracao.retorno_execucao;
CREATE CONSTRAINT TRIGGER trg_zz_retorno_execucao_movimentacao AFTER INSERT OR UPDATE OF status ON integracao.retorno_execucao
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (NEW.entidade = 'movimentacao_interna' AND NEW.documento_id IS NOT NULL AND NEW.modo <> ALL (ARRAY['teste', 'simulacao', 'lote']))
  EXECUTE FUNCTION integracao.trg_retorno_execucao_movimentacao();
