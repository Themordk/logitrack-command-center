-- =====================================================================
-- 2026-11-23 · Entregas · configuração por tipo de saída
--
-- tipo_saida (por tipo de pedido; o pedido usa documento_saida.tipo_pedido_id,
-- sem ele o tipo do movimento):
--   realiza_entrega        (padrão false) — o pedido gera demanda de entrega;
--   entrega_gerar_em       (padrão FECHADA) — MONTADA = quando a carga é liberada
--                          (antes da conferência física dos volumes) | FECHADA =
--                          quando o carregamento é concluído;
--   entrega_confere_volume (padrão false) — entrega garantida: o entregador lê
--                          cada volume do pedido no cliente antes de confirmar.
--   Só vale com realiza_embarque (sem embarque o pedido nunca entra em carga).
--
-- Geração e sincronização (_fn_entrega_gerar):
--   * entram na entrega só os pedidos ativos da carga cujo tipo realiza entrega
--     e cujo momento já chegou (MONTADA: liberada em diante; FECHADA: fechada);
--   * carga mista: a entrega nasce no 1º momento devido e recebe as paradas
--     restantes quando a carga fecha (evento PARADAS_ATUALIZADAS);
--   * pedido incluído/retirado/reordenado depois de gerar sincroniza a entrega
--     (parada sem histórico sai; com histórico fica para o gestor tratar);
--   * troca de veículo antes do aceite reatribui; carga cancelada cancela a
--     entrega sem parada finalizada.
--
-- Conferência de volume na entrega:
--   entrega_volume (uma leitura por volume da parada) + RPC
--   entrega_parada_conferir_volume; entrega_parada_confirmar recusa com
--   volumes faltando (ENTREGA_VOLUMES_PENDENTES), salvo se houver ocorrência
--   informativa registrada na parada (ex.: falta de volume = ressalva).
--   Volumes esperados = carga_unidade não cancelada do pedido na carga.
--
-- Compatibilidade: tipos de saída que já geraram entrega ficam com
-- realiza_entrega = true (mantém o comportamento atual nesses tipos).
-- Reverter: supabase/rollback/20261123_entregas_config_tipo_saida_reverter.sql
-- =====================================================================

-- ---------- 1. colunas ----------
ALTER TABLE public.tipo_saida
  ADD COLUMN IF NOT EXISTS realiza_entrega boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS entrega_gerar_em text NOT NULL DEFAULT 'FECHADA',
  ADD COLUMN IF NOT EXISTS entrega_confere_volume boolean NOT NULL DEFAULT false;
ALTER TABLE public.tipo_saida DROP CONSTRAINT IF EXISTS ck_tipo_saida_entrega_gerar_em;
ALTER TABLE public.tipo_saida ADD CONSTRAINT ck_tipo_saida_entrega_gerar_em CHECK (entrega_gerar_em IN ('MONTADA','FECHADA'));
COMMENT ON COLUMN public.tipo_saida.realiza_entrega IS 'Pedidos deste tipo geram demanda de entrega (carga de veículo próprio). Exige realiza_embarque.';
COMMENT ON COLUMN public.tipo_saida.entrega_gerar_em IS 'MONTADA = entrega gerada quando a carga é liberada; FECHADA = quando o carregamento é concluído.';
COMMENT ON COLUMN public.tipo_saida.entrega_confere_volume IS 'Entrega garantida: o entregador lê cada volume do pedido no cliente antes de confirmar a entrega.';

ALTER TABLE public.entrega_parada ADD COLUMN IF NOT EXISTS confere_volume boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.entrega_parada.confere_volume IS 'Cópia de tipo_saida.entrega_confere_volume na geração da parada.';

ALTER TABLE public.entrega_evento DROP CONSTRAINT IF EXISTS ck_entrega_evento_tipo;
ALTER TABLE public.entrega_evento ADD CONSTRAINT ck_entrega_evento_tipo CHECK (tipo = ANY (ARRAY[
  'ATRIBUIDA','ACEITA','PARADA_ENTREGUE','OCORRENCIA','PARADA_ESTORNADA','REATRIBUIDA','CANCELADA','CONCLUIDA','REABERTA',
  'PARADAS_ATUALIZADAS','VOLUME_CONFERIDO']));

-- ---------- 2. leituras de volume na entrega ----------
CREATE TABLE IF NOT EXISTS public.entrega_volume (
  id                 uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id          uuid        NOT NULL REFERENCES public.tenant(id),
  empresa_id         uuid        NOT NULL REFERENCES public.empresa(id),
  entrega_id         uuid        NOT NULL REFERENCES public.entrega(id) ON DELETE CASCADE,
  entrega_parada_id  uuid        NOT NULL REFERENCES public.entrega_parada(id) ON DELETE CASCADE,
  carga_unidade_id   uuid        NOT NULL REFERENCES public.carga_unidade(id),
  codigo             text        NOT NULL,
  digitado           boolean     NOT NULL DEFAULT false,
  conferido_em       timestamptz NOT NULL DEFAULT now(),
  conferido_por      uuid        REFERENCES public.usuario(id),
  latitude           numeric(9,6),
  longitude          numeric(9,6),
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_entrega_volume UNIQUE (entrega_parada_id, carga_unidade_id)
);
CREATE INDEX IF NOT EXISTS idx_entrega_volume_tenant ON public.entrega_volume (tenant_id, empresa_id, conferido_em);
COMMENT ON TABLE public.entrega_volume IS 'Volumes lidos pelo entregador no cliente (entrega garantida). Gravado só por entrega_parada_conferir_volume.';
ALTER TABLE public.entrega_volume ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS entrega_volume_select_tenant ON public.entrega_volume;
CREATE POLICY entrega_volume_select_tenant ON public.entrega_volume FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_current_tenant()));
REVOKE ALL ON public.entrega_volume FROM anon, authenticated;
GRANT SELECT ON public.entrega_volume TO authenticated;

-- ---------- 3. pedidos da carga com entrega devida ----------
CREATE OR REPLACE FUNCTION public._fn_entrega_docs_devidos(p_carga_id uuid)
RETURNS TABLE(carga_documento_id uuid, confere_volume boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT cd.id, ts.entrega_confere_volume
    FROM carga_documento cd
    JOIN carga c            ON c.id  = cd.carga_id
    JOIN documento_saida ds ON ds.id = cd.documento_saida_id
    LEFT JOIN movimento_saida ms ON ms.id = cd.movimento_saida_id
    JOIN tipo_saida ts      ON ts.id = COALESCE(ds.tipo_pedido_id, ms.tipo_saida)
   WHERE cd.carga_id = p_carga_id AND cd.ativo
     AND ts.realiza_entrega
     AND (ts.entrega_gerar_em = 'MONTADA' OR c.status = 'FECHADA');
$$;

-- Ordem de entrega = inverso da ordem de carregamento.
CREATE OR REPLACE FUNCTION public._fn_entrega_renumerar(p_entrega_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE entrega_parada p SET sequencia = x.rn, sequencia_carga = x.seq
    FROM (SELECT p2.id, cd.sequencia AS seq,
                 row_number() OVER (ORDER BY cd.sequencia DESC, cd.created_at DESC)::int AS rn
            FROM entrega_parada p2 JOIN carga_documento cd ON cd.id = p2.carga_documento_id
           WHERE p2.entrega_id = p_entrega_id) x
   WHERE p.id = x.id AND (p.sequencia IS DISTINCT FROM x.rn OR p.sequencia_carga IS DISTINCT FROM x.seq);
$$;

-- Insere as paradas devidas que ainda não estão na entrega.
CREATE OR REPLACE FUNCTION public._fn_entrega_inserir_paradas(p_entrega_id uuid, p_carga_id uuid, p_usuario_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_n integer;
BEGIN
  INSERT INTO entrega_parada (tenant_id, empresa_id, entrega_id, carga_documento_id, documento_saida_id, parceiro_id,
    sequencia, sequencia_carga, parceiro_nome, endereco, bairro, cidade, estado, cep, telefone, contato,
    numero_pedido, numero_nf, serie_nf, confere_volume, created_by, updated_by)
  SELECT cd.tenant_id, cd.empresa_id, p_entrega_id, cd.id, ds.id, p.id,
         0, cd.sequencia,
         COALESCE(NULLIF(btrim(p.nome_fantasia), ''), p.razaosocial), p.endereco, p.bairro, p.cidade, p.estado, p.cep,
         p.telefone, p.contato,
         COALESCE(ds.numero_pedido::text, ds.codigo_erp), nf.numero_nf, nf.serie, dv.confere_volume, p_usuario_id, p_usuario_id
    FROM public._fn_entrega_docs_devidos(p_carga_id) dv
    JOIN carga_documento cd ON cd.id = dv.carga_documento_id
    JOIN documento_saida ds ON ds.id = cd.documento_saida_id
    LEFT JOIN parceiro p ON p.id = ds.parceiro_id
    LEFT JOIN LATERAL (
      SELECT n.numero_nf, n.serie FROM documento_saida_nf n
       WHERE n.documento_saida_id = ds.id AND n.data_cancelamento IS NULL
       ORDER BY n.data_emissao DESC NULLS LAST, n.created_at DESC LIMIT 1) nf ON true
   WHERE NOT EXISTS (SELECT 1 FROM entrega_parada x WHERE x.entrega_id = p_entrega_id AND x.carga_documento_id = cd.id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

-- ---------- 4. geração + sincronização ----------
CREATE OR REPLACE FUNCTION public._fn_entrega_gerar(p_carga_id uuid, p_usuario_id uuid DEFAULT NULL::uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_c record; v_e record; v_ent uuid; v_usr uuid; v_n int; v_add int := 0; v_rem int := 0; v_fin int;
BEGIN
  SELECT c.* INTO v_c FROM carga c WHERE c.id = p_carga_id FOR UPDATE;
  IF v_c.id IS NULL OR v_c.modalidade <> 'PROPRIA' OR v_c.veiculo_id IS NULL
     OR v_c.status NOT IN ('LIBERADA','EM_CARREGAMENTO','FECHADA') THEN
    RETURN NULL;
  END IF;

  SELECT e.* INTO v_e FROM entrega e WHERE e.carga_id = p_carga_id AND e.status <> 'CANCELADA'
   ORDER BY e.created_at DESC LIMIT 1 FOR UPDATE;

  IF v_e.id IS NOT NULL THEN
    -- pedido retirado da carga: parada sem nenhum histórico sai da rota
    DELETE FROM entrega_parada p
     WHERE p.entrega_id = v_e.id AND p.status = 'PENDENTE'
       AND NOT EXISTS (SELECT 1 FROM carga_documento cd WHERE cd.id = p.carga_documento_id AND cd.ativo AND cd.carga_id = p_carga_id)
       AND NOT EXISTS (SELECT 1 FROM entrega_evento ev WHERE ev.entrega_parada_id = p.id)
       AND NOT EXISTS (SELECT 1 FROM entrega_tentativa t WHERE t.entrega_parada_id = p.id);
    GET DIAGNOSTICS v_rem = ROW_COUNT;
    v_add := public._fn_entrega_inserir_paradas(v_e.id, p_carga_id, p_usuario_id);
    PERFORM public._fn_entrega_renumerar(v_e.id);

    IF v_add > 0 OR v_rem > 0 THEN
      PERFORM public._fn_entrega_evento(v_e.id, NULL, 'PARADAS_ATUALIZADAS', p_usuario_id, NULL, NULL,
        jsonb_build_object('incluidas', v_add, 'removidas', v_rem, 'status_carga', v_c.status));
      SELECT count(*), count(*) FILTER (WHERE status <> 'PENDENTE') INTO v_n, v_fin FROM entrega_parada WHERE entrega_id = v_e.id;
      IF v_n = 0 AND v_e.status IN ('AGUARDANDO_ACEITE','EM_ROTA') THEN
        UPDATE entrega SET status = 'CANCELADA', cancelada_em = now(), cancelada_por = p_usuario_id,
               motivo_cancelamento = 'A carga não tem mais pedidos com entrega.', total_paradas = 0, updated_by = p_usuario_id
         WHERE id = v_e.id;
        PERFORM public._fn_entrega_evento(v_e.id, NULL, 'CANCELADA', p_usuario_id, NULL, NULL,
          jsonb_build_object('status_anterior', v_e.status, 'motivo', 'A carga não tem mais pedidos com entrega.'));
        RETURN NULL;
      END IF;
      PERFORM public._fn_entrega_recalcular(v_e.id, p_usuario_id);
    END IF;

    -- veículo trocado antes do aceite: o novo entregador recebe a demanda
    IF v_e.status = 'AGUARDANDO_ACEITE' AND v_e.veiculo_id IS DISTINCT FROM v_c.veiculo_id THEN
      SELECT v.usuario_id INTO v_usr FROM veiculos v WHERE v.id = v_c.veiculo_id;
      IF v_usr IS NOT NULL THEN
        UPDATE entrega SET veiculo_id = v_c.veiculo_id, usuario_id = v_usr, atribuida_em = now(), updated_by = p_usuario_id
         WHERE id = v_e.id;
        PERFORM public._fn_entrega_evento(v_e.id, NULL, 'REATRIBUIDA', p_usuario_id, NULL, NULL,
          jsonb_build_object('de_usuario_id', v_e.usuario_id, 'para_usuario_id', v_usr, 'motivo', 'Veículo da carga alterado'));
      END IF;
    END IF;
    RETURN v_e.id;
  END IF;

  -- nenhuma entrega ativa: gera se houver pedido devido
  IF NOT EXISTS (SELECT 1 FROM public._fn_entrega_docs_devidos(p_carga_id)) THEN RETURN NULL; END IF;
  SELECT v.usuario_id INTO v_usr FROM veiculos v WHERE v.id = v_c.veiculo_id;
  IF v_usr IS NULL THEN RETURN NULL; END IF;

  INSERT INTO entrega (tenant_id, empresa_id, carga_id, veiculo_id, usuario_id, status, atribuida_em, created_by, updated_by)
  VALUES (v_c.tenant_id, v_c.empresa_id, v_c.id, v_c.veiculo_id, v_usr, 'AGUARDANDO_ACEITE', now(), p_usuario_id, p_usuario_id)
  RETURNING id INTO v_ent;
  v_n := public._fn_entrega_inserir_paradas(v_ent, p_carga_id, p_usuario_id);
  PERFORM public._fn_entrega_renumerar(v_ent);
  UPDATE entrega SET total_paradas = v_n WHERE id = v_ent;

  PERFORM public._fn_entrega_evento(v_ent, NULL, 'ATRIBUIDA', p_usuario_id, NULL, NULL,
    jsonb_build_object('usuario_entregador_id', v_usr, 'paradas', v_n, 'numero_carga', v_c.numero_carga, 'status_carga', v_c.status));
  INSERT INTO carga_evento (tenant_id, empresa_id, carga_id, tipo, usuario_id, dados, created_by)
  VALUES (v_c.tenant_id, v_c.empresa_id, v_c.id, 'ENTREGA_GERADA', p_usuario_id,
          jsonb_build_object('entrega_id', v_ent, 'usuario_entregador_id', v_usr, 'paradas', v_n, 'status_carga', v_c.status), p_usuario_id);
  RETURN v_ent;
END $$;

-- ---------- 5. gatilhos ----------
CREATE OR REPLACE FUNCTION public._fn_trg_carga_entrega()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_u uuid := COALESCE(NEW.updated_by, NEW.fechada_por, NEW.liberada_por); v_e record;
BEGIN
  BEGIN
    IF NEW.status = 'CANCELADA' THEN
      FOR v_e IN SELECT e.* FROM entrega e WHERE e.carga_id = NEW.id AND e.status IN ('AGUARDANDO_ACEITE','EM_ROTA')
                    AND NOT EXISTS (SELECT 1 FROM entrega_parada p WHERE p.entrega_id = e.id AND p.status <> 'PENDENTE') LOOP
        UPDATE entrega SET status = 'CANCELADA', cancelada_em = now(), cancelada_por = COALESCE(NEW.cancelada_por, v_u),
               motivo_cancelamento = format('Carga #%s cancelada.', NEW.numero_carga), updated_by = v_u
         WHERE id = v_e.id;
        PERFORM public._fn_entrega_evento(v_e.id, NULL, 'CANCELADA', COALESCE(NEW.cancelada_por, v_u), NULL, NULL,
          jsonb_build_object('status_anterior', v_e.status, 'motivo', format('Carga #%s cancelada.', NEW.numero_carga)));
      END LOOP;
    ELSE
      PERFORM public._fn_entrega_gerar(NEW.id, v_u);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO carga_evento (tenant_id, empresa_id, carga_id, tipo, usuario_id, dados, created_by)
    VALUES (NEW.tenant_id, NEW.empresa_id, NEW.id, 'ENTREGA_FALHA_GERACAO', v_u, jsonb_build_object('erro', SQLERRM), v_u);
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_carga_entrega_gerar ON public.carga;
CREATE TRIGGER trg_carga_entrega_gerar AFTER UPDATE OF status, veiculo_id ON public.carga
  FOR EACH ROW WHEN (NEW.modalidade = 'PROPRIA'
                     AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.veiculo_id IS DISTINCT FROM OLD.veiculo_id)
                     AND NEW.status IN ('LIBERADA','EM_CARREGAMENTO','FECHADA','CANCELADA'))
  EXECUTE FUNCTION public._fn_trg_carga_entrega();

-- pedido incluído, retirado ou reordenado numa carga que já pode ter entrega
CREATE OR REPLACE FUNCTION public._fn_trg_carga_documento_entrega()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_c record; v_u uuid := COALESCE(NEW.updated_by, NEW.created_by);
BEGIN
  SELECT c.id, c.tenant_id, c.empresa_id, c.status, c.modalidade INTO v_c FROM carga c WHERE c.id = NEW.carga_id;
  IF v_c.modalidade = 'PROPRIA' AND v_c.status IN ('LIBERADA','EM_CARREGAMENTO','FECHADA') THEN
    BEGIN
      PERFORM public._fn_entrega_gerar(NEW.carga_id, v_u);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO carga_evento (tenant_id, empresa_id, carga_id, tipo, usuario_id, dados, created_by)
      VALUES (v_c.tenant_id, v_c.empresa_id, v_c.id, 'ENTREGA_FALHA_GERACAO', v_u, jsonb_build_object('erro', SQLERRM), v_u);
    END;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_carga_documento_entrega ON public.carga_documento;
CREATE TRIGGER trg_carga_documento_entrega AFTER INSERT OR UPDATE OF ativo, sequencia ON public.carga_documento
  FOR EACH ROW EXECUTE FUNCTION public._fn_trg_carga_documento_entrega();

-- ---------- 6. JSON da entrega: status da carga e volumes da parada ----------
CREATE OR REPLACE FUNCTION public._fn_entrega_volumes_json(p_parada_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', cu.id, 'codigo', cu.codigo, 'descricao', cu.descricao, 'tipo', cu.tipo, 'sequencia', cu.sequencia,
           'embarcada', cu.status = 'EMBARCADA', 'conferido_em', ev.conferido_em, 'digitado', ev.digitado)
         ORDER BY cu.sequencia, cu.codigo), '[]'::jsonb)
    FROM entrega_parada p
    JOIN carga_unidade cu ON cu.carga_documento_id = p.carga_documento_id AND cu.status <> 'CANCELADA'
    LEFT JOIN entrega_volume ev ON ev.entrega_parada_id = p.id AND ev.carga_unidade_id = cu.id
   WHERE p.id = p_parada_id;
$$;

CREATE OR REPLACE FUNCTION public._fn_entrega_json(p_entrega_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT jsonb_build_object(
    'id', e.id, 'carga_id', e.carga_id, 'numero_carga', c.numero_carga, 'status', e.status,
    'usuario_id', e.usuario_id, 'usuario_nome', u.nome,
    'veiculo_id', e.veiculo_id, 'veiculo', v.descricao, 'placa', v.placa, 'tipo_veiculo', v.tipo_veiculo,
    'atribuida_em', e.atribuida_em, 'aceita_em', e.aceita_em, 'concluida_em', e.concluida_em,
    'cancelada_em', e.cancelada_em, 'motivo_cancelamento', e.motivo_cancelamento,
    'carga_fechada_em', c.fechada_em, 'carga_status', c.status,
    'total_paradas', e.total_paradas, 'paradas_entregues', e.paradas_entregues, 'paradas_nao_entregues', e.paradas_nao_entregues,
    'proxima_parada_id', (SELECT p.id FROM entrega_parada p WHERE p.entrega_id = e.id AND p.status = 'PENDENTE' ORDER BY p.sequencia LIMIT 1),
    'paradas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'sequencia', p.sequencia, 'sequencia_carga', p.sequencia_carga, 'status', p.status,
        'documento_saida_id', p.documento_saida_id, 'parceiro_id', p.parceiro_id, 'parceiro_nome', p.parceiro_nome,
        'endereco', p.endereco, 'bairro', p.bairro, 'cidade', p.cidade, 'estado', p.estado, 'cep', p.cep,
        'telefone', COALESCE(NULLIF(btrim(pa.telefone), ''), p.telefone),
        'contato', COALESCE(NULLIF(btrim(pa.contato), ''), p.contato),
        'numero_pedido', p.numero_pedido,
        'numero_nf', COALESCE(nf.numero_nf, p.numero_nf), 'serie_nf', CASE WHEN nf.numero_nf IS NOT NULL THEN nf.serie ELSE p.serie_nf END,
        'observacao_pedido', NULLIF(btrim(ds.observacao), ''),
        'entregue_em', p.entregue_em, 'recebedor_nome', p.recebedor_nome, 'foto_canhoto_path', p.foto_canhoto_path,
        'finalizada_em', p.finalizada_em,
        'confere_volume', p.confere_volume,
        'volumes_total', vt.total, 'volumes_conferidos', vt.conferidos,
        'volumes', CASE WHEN p.confere_volume THEN public._fn_entrega_volumes_json(p.id) ELSE '[]'::jsonb END,
        'ocorrencia', CASE WHEN o.id IS NULL THEN NULL ELSE jsonb_build_object(
          'id', o.id, 'numero', o.numero_ocorrencia, 'motivo', mo.descricao, 'observacao', o.observacao,
          'criada_em', o.criado_em, 'impede_entrega', mo.impede_entrega,
          'foto_path', (SELECT a.storage_path FROM ocorrencia_anexo a WHERE a.ocorrencia_id = o.id ORDER BY a.created_at DESC LIMIT 1)) END
      ) ORDER BY p.sequencia)
        FROM entrega_parada p
        LEFT JOIN documento_saida ds ON ds.id = p.documento_saida_id
        LEFT JOIN parceiro pa ON pa.id = p.parceiro_id
        LEFT JOIN LATERAL (
          SELECT n.numero_nf, n.serie FROM documento_saida_nf n
           WHERE n.documento_saida_id = p.documento_saida_id AND n.data_cancelamento IS NULL
           ORDER BY n.data_emissao DESC NULLS LAST, n.created_at DESC LIMIT 1) nf ON true
        LEFT JOIN LATERAL (
          SELECT count(*)::int AS total, count(ev.id)::int AS conferidos
            FROM carga_unidade cu
            LEFT JOIN entrega_volume ev ON ev.entrega_parada_id = p.id AND ev.carga_unidade_id = cu.id
           WHERE cu.carga_documento_id = p.carga_documento_id AND cu.status <> 'CANCELADA') vt ON true
        LEFT JOIN ocorrencia_operacional o ON o.id = p.ultima_ocorrencia_id
        LEFT JOIN motivo_ocorrencia mo ON mo.id = o.motivo_ocorrencia_id
       WHERE p.entrega_id = e.id), '[]'::jsonb))
    FROM entrega e
    JOIN carga c ON c.id = e.carga_id
    LEFT JOIN usuario u ON u.id = e.usuario_id
    LEFT JOIN veiculos v ON v.id = e.veiculo_id
   WHERE e.id = p_entrega_id;
$function$;

-- ---------- 7. conferência do volume no cliente ----------
CREATE OR REPLACE FUNCTION public.entrega_parada_conferir_volume(
  p_tenant_id uuid, p_usuario_id uuid, p_parada_id uuid, p_codigo text, p_digitado boolean DEFAULT false,
  p_latitude numeric DEFAULT NULL, p_longitude numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_u uuid; v_p public.entrega_parada; v_cod text := upper(btrim(COALESCE(p_codigo, ''))); v_un record; v_outra record;
        v_tot int; v_conf int;
BEGIN
  v_u := public._fn_entrega_autorizar(p_tenant_id, p_usuario_id, 'COLETOR');
  IF v_cod = '' THEN RAISE EXCEPTION 'ENTREGA_VOLUME_CODIGO_VAZIO: leia a etiqueta do volume.'; END IF;
  v_p := public._fn_entrega_parada_para_acao(p_tenant_id, p_parada_id, v_u);
  IF NOT v_p.confere_volume THEN
    RAISE EXCEPTION 'ENTREGA_SEM_CONFERENCIA_VOLUME: este pedido não exige leitura dos volumes na entrega.';
  END IF;

  SELECT cu.* INTO v_un
    FROM carga_unidade cu
    LEFT JOIN documento_saida ds ON ds.id = v_p.documento_saida_id
   WHERE cu.carga_documento_id = v_p.carga_documento_id AND cu.status <> 'CANCELADA'
     AND (upper(cu.codigo) = v_cod OR (cu.tipo::text IN ('DOCUMENTO','CONFIRMACAO') AND upper(COALESCE(ds.codigo_erp, '')) = v_cod))
   ORDER BY cu.sequencia LIMIT 1;

  IF v_un.id IS NULL THEN
    SELECT p.sequencia, p.parceiro_nome, p.numero_pedido INTO v_outra
      FROM entrega_parada p JOIN carga_unidade cu ON cu.carga_documento_id = p.carga_documento_id AND cu.status <> 'CANCELADA'
     WHERE p.entrega_id = v_p.entrega_id AND p.id <> v_p.id AND upper(cu.codigo) = v_cod LIMIT 1;
    IF v_outra.sequencia IS NOT NULL THEN
      RAISE EXCEPTION 'ENTREGA_VOLUME_OUTRA_PARADA: este volume é da parada % (%, pedido %). Não entregue aqui.',
        v_outra.sequencia, COALESCE(v_outra.parceiro_nome, 'outro cliente'), COALESCE(v_outra.numero_pedido, '—');
    END IF;
    RAISE EXCEPTION 'ENTREGA_VOLUME_NAO_ENCONTRADO: o código % não é volume deste pedido.', v_cod;
  END IF;
  IF EXISTS (SELECT 1 FROM entrega_volume ev WHERE ev.entrega_parada_id = v_p.id AND ev.carga_unidade_id = v_un.id) THEN
    RAISE EXCEPTION 'ENTREGA_VOLUME_JA_CONFERIDO: % já foi lido nesta entrega.', COALESCE(v_un.descricao, v_un.codigo);
  END IF;

  INSERT INTO entrega_volume (tenant_id, empresa_id, entrega_id, entrega_parada_id, carga_unidade_id, codigo, digitado,
                              conferido_por, latitude, longitude)
  VALUES (v_p.tenant_id, v_p.empresa_id, v_p.entrega_id, v_p.id, v_un.id, v_un.codigo, COALESCE(p_digitado, false),
          v_u, p_latitude, p_longitude);
  PERFORM public._fn_entrega_evento(v_p.entrega_id, v_p.id, 'VOLUME_CONFERIDO', v_u, p_latitude, p_longitude,
    jsonb_build_object('carga_unidade_id', v_un.id, 'codigo', v_un.codigo, 'digitado', COALESCE(p_digitado, false)));

  SELECT count(*)::int, count(ev.id)::int INTO v_tot, v_conf
    FROM carga_unidade cu LEFT JOIN entrega_volume ev ON ev.entrega_parada_id = v_p.id AND ev.carga_unidade_id = cu.id
   WHERE cu.carga_documento_id = v_p.carga_documento_id AND cu.status <> 'CANCELADA';

  RETURN jsonb_build_object('sucesso', true, 'codigo', CASE WHEN v_conf >= v_tot THEN 'ENTREGA_VOLUMES_COMPLETOS' ELSE 'ENTREGA_VOLUME_CONFERIDO' END,
    'mensagem', CASE WHEN v_conf >= v_tot THEN format('Todos os %s volume(s) conferidos.', v_tot)
                     ELSE format('%s lido (%s de %s).', COALESCE(v_un.descricao, v_un.codigo), v_conf, v_tot) END,
    'dados', jsonb_build_object('total', v_tot, 'conferidos', v_conf, 'codigo', v_un.codigo, 'entrega', public._fn_entrega_json(v_p.entrega_id)));
EXCEPTION WHEN raise_exception THEN RETURN public._fn_carga_erro(SQLERRM);
END $$;

-- ---------- 8. confirmar: volumes completos ou ressalva registrada ----------
CREATE OR REPLACE FUNCTION public.entrega_parada_confirmar(p_tenant_id uuid, p_usuario_id uuid, p_parada_id uuid, p_foto_path text,
  p_recebedor_nome text DEFAULT NULL::text, p_latitude numeric DEFAULT NULL::numeric, p_longitude numeric DEFAULT NULL::numeric,
  p_precisao_m numeric DEFAULT NULL::numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_u uuid; v_p public.entrega_parada; v_fora boolean; v_status text; v_tot int := 0; v_conf int := 0; v_ressalva boolean := false;
BEGIN
  v_u := public._fn_entrega_autorizar(p_tenant_id, p_usuario_id, 'COLETOR');
  v_p := public._fn_entrega_parada_para_acao(p_tenant_id, p_parada_id, v_u);

  IF v_p.confere_volume THEN
    SELECT count(*)::int, count(ev.id)::int INTO v_tot, v_conf
      FROM carga_unidade cu LEFT JOIN entrega_volume ev ON ev.entrega_parada_id = v_p.id AND ev.carga_unidade_id = cu.id
     WHERE cu.carga_documento_id = v_p.carga_documento_id AND cu.status <> 'CANCELADA';
    IF v_conf < v_tot THEN
      -- ocorrência informativa desde a última tentativa desta parada vira ressalva e libera a confirmação
      v_ressalva := EXISTS (
        SELECT 1 FROM entrega_evento ev
         WHERE ev.entrega_parada_id = v_p.id AND ev.tipo = 'OCORRENCIA'
           AND COALESCE((ev.dados->>'impede_entrega')::boolean, true) = false
           AND ev.ocorrido_em > COALESCE((SELECT max(t.registrada_em) FROM entrega_tentativa t WHERE t.entrega_parada_id = v_p.id), '-infinity'));
      IF NOT v_ressalva THEN
        RAISE EXCEPTION 'ENTREGA_VOLUMES_PENDENTES: faltam % de % volume(s). Leia todos ou registre uma ocorrência (ex.: falta de volume) antes de confirmar.',
          v_tot - v_conf, v_tot;
      END IF;
    END IF;
  END IF;

  PERFORM public._fn_entrega_foto_valida(p_tenant_id, v_p.entrega_id, v_p.id, p_foto_path);
  v_fora := EXISTS (SELECT 1 FROM entrega_parada x WHERE x.entrega_id = v_p.entrega_id AND x.status = 'PENDENTE' AND x.sequencia < v_p.sequencia);

  UPDATE entrega_parada
     SET status = 'ENTREGUE', entregue_em = now(), entregue_por = v_u, finalizada_em = now(),
         recebedor_nome = NULLIF(btrim(left(p_recebedor_nome, 120)), ''), foto_canhoto_path = p_foto_path,
         latitude = p_latitude, longitude = p_longitude, precisao_m = p_precisao_m, updated_by = v_u
   WHERE id = v_p.id;
  PERFORM public._fn_entrega_evento(v_p.entrega_id, v_p.id, 'PARADA_ENTREGUE', v_u, p_latitude, p_longitude,
    jsonb_build_object('foto_path', p_foto_path, 'recebedor_nome', NULLIF(btrim(p_recebedor_nome), ''),
                       'fora_de_ordem', v_fora, 'sequencia', v_p.sequencia, 'precisao_m', p_precisao_m,
                       'confere_volume', v_p.confere_volume, 'volumes_total', v_tot, 'volumes_conferidos', v_conf,
                       'volumes_com_ressalva', v_ressalva));
  v_status := public._fn_entrega_recalcular(v_p.entrega_id, v_u);
  RETURN jsonb_build_object('sucesso', true, 'codigo', CASE WHEN v_status = 'CONCLUIDA' THEN 'ENTREGA_CONCLUIDA' ELSE 'PARADA_ENTREGUE' END,
    'mensagem', CASE WHEN v_status = 'CONCLUIDA' THEN 'Entrega registrada. Todas as paradas foram finalizadas.'
                     ELSE format('Entrega para %s registrada.', COALESCE(v_p.parceiro_nome, 'o cliente')) END,
    'dados', public._fn_entrega_json(v_p.entrega_id));
EXCEPTION WHEN raise_exception THEN RETURN public._fn_carga_erro(SQLERRM);
END $function$;

-- ---------- 9. motivo de não ter entrega / geração manual ----------
CREATE OR REPLACE FUNCTION public._fn_entrega_motivo_sem_entrega(p_carga_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_c record; v_veic record; v_realiza boolean; v_montada boolean;
BEGIN
  SELECT c.* INTO v_c FROM carga c WHERE c.id = p_carga_id;
  SELECT v.descricao, v.usuario_id INTO v_veic FROM veiculos v WHERE v.id = v_c.veiculo_id;
  SELECT bool_or(ts.realiza_entrega), bool_or(ts.realiza_entrega AND ts.entrega_gerar_em = 'MONTADA')
    INTO v_realiza, v_montada
    FROM carga_documento cd
    JOIN documento_saida ds ON ds.id = cd.documento_saida_id
    LEFT JOIN movimento_saida ms ON ms.id = cd.movimento_saida_id
    JOIN tipo_saida ts ON ts.id = COALESCE(ds.tipo_pedido_id, ms.tipo_saida)
   WHERE cd.carga_id = p_carga_id AND cd.ativo;
  RETURN CASE
    WHEN v_c.modalidade <> 'PROPRIA' THEN 'Carga de transportadora não gera entrega.'
    WHEN v_c.status = 'CANCELADA' THEN 'Carga cancelada.'
    WHEN v_c.veiculo_id IS NULL THEN 'A carga não tem veículo próprio.'
    WHEN v_veic.usuario_id IS NULL THEN format('O veículo %s não tem usuário entregador vinculado (Dados Mestres › Veículos).', COALESCE(v_veic.descricao, ''))
    WHEN NOT COALESCE(v_realiza, false) THEN 'Nenhum pedido desta carga é de tipo de saída que realiza entrega (Cadastros › Tipos de Saída).'
    WHEN v_c.status = 'EM_MONTAGEM' AND v_montada THEN 'A entrega é gerada quando a carga for liberada (montada).'
    WHEN v_c.status = 'EM_MONTAGEM' OR (v_c.status IN ('LIBERADA','EM_CARREGAMENTO') AND NOT v_montada)
      THEN 'A entrega é gerada quando o carregamento for concluído.'
    ELSE NULL END;
END $$;

CREATE OR REPLACE FUNCTION public.entrega_carga_detalhe(p_tenant_id uuid, p_usuario_id uuid, p_carga_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_u uuid; v_c record; v_ent uuid; v_motivo text; v_veic record; v_ativa boolean;
BEGIN
  v_u := public._fn_entrega_autorizar(p_tenant_id, p_usuario_id, 'LER');
  SELECT c.* INTO v_c FROM carga c WHERE c.id = p_carga_id AND c.tenant_id = p_tenant_id;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'CARGA_NAO_ENCONTRADA: carga não encontrada.'; END IF;
  SELECT e.id INTO v_ent FROM entrega e WHERE e.carga_id = p_carga_id ORDER BY (e.status <> 'CANCELADA') DESC, e.created_at DESC LIMIT 1;
  v_ativa := EXISTS (SELECT 1 FROM entrega e WHERE e.carga_id = p_carga_id AND e.status <> 'CANCELADA');
  SELECT v.descricao, v.placa, v.usuario_id, u.nome AS usuario_nome INTO v_veic
    FROM veiculos v LEFT JOIN usuario u ON u.id = v.usuario_id WHERE v.id = v_c.veiculo_id;
  v_motivo := public._fn_entrega_motivo_sem_entrega(p_carga_id);
  RETURN jsonb_build_object('sucesso', true, 'codigo', 'OK', 'dados', jsonb_build_object(
    'carga_status', v_c.status,
    'entrega', CASE WHEN v_ent IS NULL THEN NULL ELSE public._fn_entrega_json(v_ent) END,
    'saidas', COALESCE((SELECT jsonb_agg(public._fn_entrega_json(e.id) || jsonb_build_object('numero_saida', rn) ORDER BY e.created_at)
                          FROM (SELECT e.*, row_number() OVER (ORDER BY e.created_at) rn FROM entrega e WHERE e.carga_id = p_carga_id) e), '[]'::jsonb),
    'tentativas', public._fn_entrega_tentativas_json(p_carga_id),
    'veiculo_entregador', v_veic.usuario_nome,
    'motivo_sem_entrega', v_motivo,
    'pode_gerar', v_motivo IS NULL AND NOT v_ativa AND public.fn_usuario_tem_permissao(v_u, 'web.atividades.montagem-carga', 'UPDATE'),
    'pode_gerenciar', public.fn_usuario_tem_permissao(v_u, 'web.atividades.montagem-carga', 'UPDATE'),
    'eventos', COALESCE((SELECT jsonb_agg(jsonb_build_object('tipo', ev.tipo, 'ocorrido_em', ev.ocorrido_em, 'usuario', u.nome,
                                   'parada_id', ev.entrega_parada_id, 'entrega_id', ev.entrega_id, 'numero_saida', s.rn,
                                   'sequencia_parada', p.sequencia, 'dados', ev.dados) ORDER BY ev.seq DESC)
                          FROM entrega_evento ev
                          JOIN (SELECT e.id, row_number() OVER (ORDER BY e.created_at) rn FROM entrega e WHERE e.carga_id = p_carga_id) s ON s.id = ev.entrega_id
                          LEFT JOIN entrega_parada p ON p.id = ev.entrega_parada_id
                          LEFT JOIN usuario u ON u.id = ev.usuario_id), '[]'::jsonb)));
EXCEPTION WHEN raise_exception THEN RETURN public._fn_carga_erro(SQLERRM);
END $$;

CREATE OR REPLACE FUNCTION public.entrega_gerar_manual(p_tenant_id uuid, p_usuario_id uuid, p_carga_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_u uuid; v_c record; v_ent uuid; v_veic_usr uuid; v_motivo text;
BEGIN
  v_u := public._fn_entrega_autorizar(p_tenant_id, p_usuario_id, 'GESTOR');
  SELECT c.* INTO v_c FROM carga c WHERE c.id = p_carga_id AND c.tenant_id = p_tenant_id FOR UPDATE;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'CARGA_NAO_ENCONTRADA: carga não encontrada.'; END IF;
  IF v_c.modalidade <> 'PROPRIA' THEN RAISE EXCEPTION 'ENTREGA_CARGA_TERCEIRO: carga de transportadora não gera entrega.'; END IF;
  SELECT v.usuario_id INTO v_veic_usr FROM veiculos v WHERE v.id = v_c.veiculo_id;
  IF v_veic_usr IS NULL THEN
    RAISE EXCEPTION 'ENTREGA_VEICULO_SEM_ENTREGADOR: vincule um usuário entregador ao veículo em Dados Mestres › Veículos.';
  END IF;
  IF NOT public._fn_entrega_usuario_elegivel(p_tenant_id, v_veic_usr) THEN
    RAISE EXCEPTION 'ENTREGA_ENTREGADOR_INVALIDO: o entregador do veículo está inativo ou sem a permissão Entregas.';
  END IF;
  IF EXISTS (SELECT 1 FROM entrega e WHERE e.carga_id = p_carga_id AND e.status <> 'CANCELADA') THEN
    RAISE EXCEPTION 'ENTREGA_JA_GERADA: esta carga já tem entrega.';
  END IF;
  v_motivo := public._fn_entrega_motivo_sem_entrega(p_carga_id);
  IF v_motivo IS NOT NULL THEN RAISE EXCEPTION 'ENTREGA_NAO_DISPONIVEL: %', v_motivo; END IF;
  v_ent := public._fn_entrega_gerar(p_carga_id, v_u);
  IF v_ent IS NULL THEN RAISE EXCEPTION 'ENTREGA_SEM_PEDIDO_ELEGIVEL: nenhum pedido da carga está pronto para entrega.'; END IF;
  RETURN jsonb_build_object('sucesso', true, 'codigo', 'ENTREGA_GERADA',
    'mensagem', format('Entrega da carga #%s gerada e enviada ao entregador.', v_c.numero_carga),
    'dados', public._fn_entrega_json(v_ent));
EXCEPTION WHEN raise_exception THEN RETURN public._fn_carga_erro(SQLERRM);
END $function$;

-- ---------- 10. compatibilidade: tipos que já geraram entrega ----------
UPDATE public.tipo_saida ts SET realiza_entrega = true
 WHERE NOT ts.realiza_entrega
   AND EXISTS (SELECT 1 FROM entrega_parada p
                 JOIN carga_documento cd ON cd.id = p.carga_documento_id
                 JOIN documento_saida ds ON ds.id = p.documento_saida_id
                 LEFT JOIN movimento_saida ms ON ms.id = cd.movimento_saida_id
                WHERE COALESCE(ds.tipo_pedido_id, ms.tipo_saida) = ts.id);

-- ---------- 11. permissões ----------
REVOKE ALL ON FUNCTION public._fn_entrega_docs_devidos(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_entrega_renumerar(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_entrega_inserir_paradas(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_entrega_gerar(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_trg_carga_entrega() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_trg_carga_documento_entrega() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_entrega_volumes_json(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_entrega_json(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_entrega_motivo_sem_entrega(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.entrega_parada_conferir_volume(uuid, uuid, uuid, text, boolean, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entrega_parada_conferir_volume(uuid, uuid, uuid, text, boolean, numeric, numeric) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.entrega_parada_confirmar(uuid, uuid, uuid, text, text, numeric, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entrega_parada_confirmar(uuid, uuid, uuid, text, text, numeric, numeric, numeric) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.entrega_carga_detalhe(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entrega_carga_detalhe(uuid, uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.entrega_gerar_manual(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entrega_gerar_manual(uuid, uuid, uuid) TO authenticated, service_role;
