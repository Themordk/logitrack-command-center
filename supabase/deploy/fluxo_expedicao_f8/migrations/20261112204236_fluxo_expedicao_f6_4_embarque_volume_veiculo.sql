-- =====================================================================
-- Fluxo de Expedição — F6.4 Embarque por volume e confirmação do veículo · 2026-11-12
-- Decisões (12/11):
--   D1 confirmação do veículo configurada por TIPO DE SAÍDA (tipo_saida.exige_confirmacao_veiculo);
--      vale para carga de veículo próprio com ao menos uma onda desse tipo.
--   D2/D3 pedido sem volume (Gera volume = Nenhuma/Carregamento, ou conferência sem volume):
--      os volumes são gerados no embarque (quantidade por pedido, etiquetas, leitura de cada uma).
--   D4 o código do volume pode ser digitado (fica registrado em carga_evento).
--   D5 transportadora não exige confirmação do veículo.
-- O embarque passa a conferir sempre volumes: some a confirmação manual por pedido.
-- Reversão: 20261112_fluxo_expedicao_f6_4_down.sql
-- =====================================================================

-- ---------- veículo: código de identificação (QR da etiqueta) ----------
CREATE OR REPLACE FUNCTION public._fn_gerar_codigo_veiculo()
RETURNS text LANGUAGE plpgsql VOLATILE SET search_path TO 'public', 'extensions' AS $$
DECLARE
  v_alf constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_b bytea := extensions.gen_random_bytes(12); v text := 'VEI-'; i int;
BEGIN
  FOR i IN 0..11 LOOP v := v || substr(v_alf, (get_byte(v_b, i) % 32) + 1, 1); END LOOP;
  RETURN v;
END $$;

ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS codigo_identificacao text;
UPDATE public.veiculos SET codigo_identificacao = public._fn_gerar_codigo_veiculo() WHERE codigo_identificacao IS NULL;
ALTER TABLE public.veiculos ALTER COLUMN codigo_identificacao SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_veiculos_codigo_identificacao ON public.veiculos (tenant_id, codigo_identificacao);
COMMENT ON COLUMN public.veiculos.codigo_identificacao IS 'Código aleatório do QR da etiqueta do veículo; confirmado no início do embarque.';

CREATE OR REPLACE FUNCTION public.tg_veiculos_codigo_identificacao()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.codigo_identificacao := public._fn_gerar_codigo_veiculo();
  ELSIF NEW.codigo_identificacao IS DISTINCT FROM OLD.codigo_identificacao
        AND current_setting('logitrack.veiculo_novo_codigo', true) IS DISTINCT FROM 'on' THEN
    NEW.codigo_identificacao := OLD.codigo_identificacao;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_veiculos_codigo_identificacao ON public.veiculos;
CREATE TRIGGER trg_veiculos_codigo_identificacao BEFORE INSERT OR UPDATE ON public.veiculos
  FOR EACH ROW EXECUTE FUNCTION public.tg_veiculos_codigo_identificacao();


-- ---------- tipo de saída: exige confirmação do veículo ----------
ALTER TABLE public.tipo_saida ADD COLUMN IF NOT EXISTS exige_confirmacao_veiculo boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.tipo_saida.exige_confirmacao_veiculo IS 'Embarque em veículo próprio exige ler o QR da etiqueta do veículo antes de conferir.';

-- ---------- carga: confirmação do veículo + eventos de rastreabilidade ----------
ALTER TABLE public.carga
  ADD COLUMN IF NOT EXISTS veiculo_confirmado_em timestamptz,
  ADD COLUMN IF NOT EXISTS veiculo_confirmado_por uuid REFERENCES public.usuario(id);

-- Gera um novo código (etiqueta perdida ou copiada): a etiqueta anterior deixa de valer.
CREATE OR REPLACE FUNCTION public.veiculo_gerar_novo_codigo(p_tenant_id uuid, p_veiculo_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_u uuid; v_cod text;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);
  SELECT u.id INTO v_u FROM usuario u WHERE u.auth_user_id = auth.uid() AND u.tenant_id = p_tenant_id;
  IF v_u IS NULL OR NOT (public.fn_usuario_tem_permissao(v_u, 'web.armazem.veiculos', 'UPDATE')) THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'VEICULO_SEM_PERMISSAO', 'mensagem', 'Seu perfil não pode alterar veículos.');
  END IF;
  PERFORM set_config('logitrack.veiculo_novo_codigo', 'on', true);
  UPDATE veiculos SET codigo_identificacao = public._fn_gerar_codigo_veiculo()
   WHERE id = p_veiculo_id AND tenant_id = p_tenant_id RETURNING codigo_identificacao INTO v_cod;
  PERFORM set_config('logitrack.veiculo_novo_codigo', 'off', true);
  IF v_cod IS NULL THEN RETURN jsonb_build_object('sucesso', false, 'codigo', 'VEICULO_NAO_ENCONTRADO', 'mensagem', 'Veículo não encontrado.'); END IF;
  -- cargas abertas confirmadas com a etiqueta antiga precisam confirmar de novo
  UPDATE carga SET veiculo_confirmado_em = NULL, veiculo_confirmado_por = NULL
   WHERE veiculo_id = p_veiculo_id AND status IN ('LIBERADA','EM_CARREGAMENTO') AND veiculo_confirmado_em IS NOT NULL;
  RETURN jsonb_build_object('sucesso', true, 'codigo', 'VEICULO_CODIGO_GERADO',
    'mensagem', 'Novo código gerado. Imprima a etiqueta nova; a anterior não vale mais.', 'dados', jsonb_build_object('codigo_identificacao', v_cod));
END $$;
CREATE OR REPLACE FUNCTION public.tg_carga_veiculo_confirmacao_reset()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.veiculo_id IS DISTINCT FROM OLD.veiculo_id OR NEW.modalidade IS DISTINCT FROM OLD.modalidade THEN
    NEW.veiculo_confirmado_em := NULL; NEW.veiculo_confirmado_por := NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_carga_veiculo_confirmacao_reset ON public.carga;
CREATE TRIGGER trg_carga_veiculo_confirmacao_reset BEFORE UPDATE ON public.carga
  FOR EACH ROW EXECUTE FUNCTION public.tg_carga_veiculo_confirmacao_reset();

CREATE TABLE IF NOT EXISTS public.carga_evento (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   uuid        NOT NULL REFERENCES public.tenant(id),
  empresa_id  uuid        NOT NULL REFERENCES public.empresa(id),
  carga_id    uuid        NOT NULL REFERENCES public.carga(id) ON DELETE CASCADE,
  tipo        text        NOT NULL,
  usuario_id  uuid        REFERENCES public.usuario(id),
  dados       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid
);
CREATE INDEX IF NOT EXISTS idx_carga_evento_carga ON public.carga_evento (carga_id, created_at);
CREATE INDEX IF NOT EXISTS idx_carga_evento_tenant ON public.carga_evento (tenant_id, empresa_id, created_at);
ALTER TABLE public.carga_evento ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS carga_evento_select_tenant ON public.carga_evento;
CREATE POLICY carga_evento_select_tenant ON public.carga_evento FOR SELECT
  USING (tenant_id = (SELECT get_current_tenant()));
REVOKE INSERT, UPDATE, DELETE ON public.carga_evento FROM anon, authenticated;
COMMENT ON TABLE public.carga_evento IS 'Rastreabilidade do embarque: confirmações e tentativas de veículo, volumes gerados no embarque, códigos digitados.';

CREATE OR REPLACE FUNCTION public._fn_carga_registrar_evento(p_carga_id uuid, p_tipo text, p_usuario_id uuid, p_dados jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  INSERT INTO carga_evento (tenant_id, empresa_id, carga_id, tipo, usuario_id, dados, created_by)
  SELECT c.tenant_id, c.empresa_id, c.id, p_tipo, p_usuario_id, COALESCE(p_dados, '{}'::jsonb), p_usuario_id FROM carga c WHERE c.id = p_carga_id;
$$;

CREATE OR REPLACE FUNCTION public._fn_carga_exige_confirmacao_veiculo(p_carga_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT c.modalidade = 'PROPRIA' AND c.veiculo_id IS NOT NULL AND EXISTS (
           SELECT 1 FROM carga_documento cd JOIN movimento_saida ms ON ms.id = cd.movimento_saida_id
             JOIN tipo_saida ts ON ts.id = ms.tipo_saida
            WHERE cd.carga_id = c.id AND cd.ativo AND ts.exige_confirmacao_veiculo)
    FROM carga c WHERE c.id = p_carga_id;
$$;

-- Bloqueia leitura/geração antes de confirmar o veículo (quando exigido)
CREATE OR REPLACE FUNCTION public._fn_embarque_checar_veiculo(p_carga_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_c record;
BEGIN
  SELECT c.numero_carga, c.veiculo_confirmado_em, v.descricao, v.placa INTO v_c
    FROM carga c LEFT JOIN veiculos v ON v.id = c.veiculo_id WHERE c.id = p_carga_id;
  IF v_c.veiculo_confirmado_em IS NULL AND public._fn_carga_exige_confirmacao_veiculo(p_carga_id) THEN
    RAISE EXCEPTION 'EMBARQUE_VEICULO_NAO_CONFIRMADO: leia a etiqueta do veículo % (%) antes de embarcar.', v_c.descricao, COALESCE(v_c.placa, '-');
  END IF;
END $$;

-- ---------- confirmar o veículo pelo QR ----------
CREATE OR REPLACE FUNCTION public.embarque_confirmar_veiculo(p_tenant_id uuid, p_carga_id uuid, p_usuario_id uuid, p_codigo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_u uuid; v_c record; v_cod text := upper(regexp_replace(COALESCE(p_codigo, ''), '\s', '', 'g')); v_lido record;
BEGIN
  v_u := public._fn_carga_autorizar(p_tenant_id, p_usuario_id, true);
  SELECT c.*, v.descricao AS veic_desc, v.placa AS veic_placa, v.codigo_identificacao AS veic_cod INTO v_c
    FROM carga c LEFT JOIN veiculos v ON v.id = c.veiculo_id
   WHERE c.id = p_carga_id AND c.tenant_id = p_tenant_id FOR UPDATE OF c;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'CARGA_NAO_ENCONTRADA: carga não encontrada.'; END IF;
  IF v_c.status NOT IN ('LIBERADA','EM_CARREGAMENTO') THEN
    RAISE EXCEPTION 'EMBARQUE_CARGA_INDISPONIVEL: a carga #% está em %.', v_c.numero_carga, v_c.status;
  END IF;
  IF v_c.modalidade <> 'PROPRIA' OR v_c.veiculo_id IS NULL THEN
    RETURN jsonb_build_object('sucesso', true, 'codigo', 'EMBARQUE_VEICULO_NAO_EXIGIDO',
      'mensagem', 'Carga de transportadora: não há etiqueta de veículo para confirmar.', 'dados', public._fn_carga_detalhe(p_carga_id));
  END IF;
  IF v_cod = '' THEN RAISE EXCEPTION 'EMBARQUE_CODIGO_VAZIO: leia o QR da etiqueta do veículo.'; END IF;

  IF v_cod = upper(v_c.veic_cod) THEN
    UPDATE carga SET veiculo_confirmado_em = now(), veiculo_confirmado_por = v_u, updated_by = v_u WHERE id = p_carga_id;
    PERFORM public._fn_carga_registrar_evento(p_carga_id, 'VEICULO_CONFIRMADO', v_u, jsonb_build_object('veiculo_id', v_c.veiculo_id));
    RETURN jsonb_build_object('sucesso', true, 'codigo', 'EMBARQUE_VEICULO_CONFIRMADO',
      'mensagem', format('Veículo %s (%s) confirmado. Pode iniciar o embarque.', v_c.veic_desc, COALESCE(v_c.veic_placa, '-')),
      'dados', public._fn_carga_detalhe(p_carga_id));
  END IF;

  SELECT v.id, v.descricao, v.placa INTO v_lido FROM veiculos v WHERE v.tenant_id = p_tenant_id AND upper(v.codigo_identificacao) = v_cod;
  IF v_lido.id IS NULL THEN
    PERFORM public._fn_carga_registrar_evento(p_carga_id, 'VEICULO_CODIGO_INVALIDO', v_u, jsonb_build_object('codigo_lido', left(v_cod, 40)));
    RETURN public._fn_carga_erro('EMBARQUE_VEICULO_CODIGO_INVALIDO: esta etiqueta não é de nenhum veículo cadastrado (ou foi substituída).');
  END IF;
  PERFORM public._fn_carga_registrar_evento(p_carga_id, 'VEICULO_DIVERGENTE', v_u,
    jsonb_build_object('veiculo_esperado_id', v_c.veiculo_id, 'veiculo_lido_id', v_lido.id));
  RETURN public._fn_carga_erro(format('EMBARQUE_VEICULO_DIVERGENTE: este é o veículo %s (%s); a carga #%s sai no veículo %s (%s).',
    v_lido.descricao, COALESCE(v_lido.placa, '-'), v_c.numero_carga, v_c.veic_desc, COALESCE(v_c.veic_placa, '-')));
EXCEPTION WHEN raise_exception THEN RETURN public._fn_carga_erro(SQLERRM);
END $$;

-- ---------- unidades da carga: sempre volumes ----------
CREATE OR REPLACE FUNCTION public._fn_carga_gerar_unidades(p_carga_id uuid, p_ondas uuid[] DEFAULT NULL::uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_c record; v_emb uuid; v_onda uuid; v_n integer := 0; v_ins integer;
  v_cd_primeiro uuid; v_seq_primeiro integer; u record; v_tarefa uuid; v_armazem uuid;
BEGIN
  SELECT c.* INTO v_c FROM carga c WHERE c.id = p_carga_id;
  SELECT tt.id INTO v_emb FROM tipo_tarefa tt WHERE tt.tenant_id = v_c.tenant_id AND tt.codigo = 'EMB';
  IF v_emb IS NULL THEN RAISE EXCEPTION 'CARGA_SEM_TIPO_EMB: tipo de tarefa EMB não encontrado para o tenant.'; END IF;
  SELECT b.armazem_id INTO v_armazem FROM box b WHERE b.id = v_c.box_id;

  FOR v_onda IN SELECT DISTINCT cd.movimento_saida_id FROM carga_documento cd
                 WHERE cd.carga_id = p_carga_id AND cd.ativo AND (p_ondas IS NULL OR cd.movimento_saida_id = ANY(p_ondas)) LOOP
    SELECT cd.id, cd.sequencia INTO v_cd_primeiro, v_seq_primeiro FROM carga_documento cd
     WHERE cd.carga_id = p_carga_id AND cd.ativo AND cd.movimento_saida_id = v_onda ORDER BY cd.sequencia LIMIT 1;

    -- volume do pedido; volume sem pedido vai para o (único/primeiro) pedido da onda
    INSERT INTO carga_unidade (tenant_id, empresa_id, carga_id, carga_documento_id, movimento_saida_id, tipo, referencia_id, codigo, descricao, sequencia)
    SELECT v_c.tenant_id, v_c.empresa_id, p_carga_id, COALESCE(cd.id, v_cd_primeiro), v_onda, 'VOLUME', v.id, v.codigo_volume::text,
           format('Volume %s', COALESCE(v.numero_volume::text, v.codigo_volume::text)), COALESCE(cd.sequencia, v_seq_primeiro)
      FROM volume_expedicao v
      LEFT JOIN carga_documento cd ON cd.carga_id = p_carga_id AND cd.ativo AND cd.documento_saida_id = v.documento_saida_id
     WHERE v.movimento_saida_id = v_onda AND v.codigo_volume IS NOT NULL
       AND (v.documento_saida_id IS NULL OR cd.id IS NOT NULL)
    ON CONFLICT (carga_id, codigo) WHERE status <> 'CANCELADA' DO NOTHING;
    GET DIAGNOSTICS v_ins = ROW_COUNT;
    v_n := v_n + v_ins;
    -- pedido sem volume: aguarda a geração dos volumes no embarque (embarque_gerar_volumes)
  END LOOP;

  FOR u IN SELECT cu.* FROM carga_unidade cu WHERE cu.carga_id = p_carga_id AND cu.status = 'PENDENTE' AND cu.tarefa_id IS NULL LOOP
    INSERT INTO tarefa (tenant_id, empresa_id, tipo_tarefa_id, id_documento_origem, tipo_documento_origem,
                        quantidade_requerida, status, ordem_tarefa, armazem_id, criado_por)
    VALUES (v_c.tenant_id, v_c.empresa_id, v_emb, u.id, 'CARGA_UNIDADE', 1, 'CRIADA', u.sequencia, v_armazem,
            public.fn_audit_usuario_atual())
    RETURNING id INTO v_tarefa;
    UPDATE carga_unidade SET tarefa_id = v_tarefa WHERE id = u.id;
  END LOOP;
  RETURN v_n;
END $$;

-- Liberar: a carga passa a ser conferida por volume
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.carga_liberar(uuid,uuid,uuid)'::regprocedure);
  n := replace(d, 'unidade_embarque = COALESCE(v_unid, ''CONFIRMACAO'')', 'unidade_embarque = ''VOLUME''');
  n := replace(n, '''mensagem'', format(''Carga #%s liberada para o embarque com %s unidade(s).'', v_c.numero_carga, v_n)',
                  '''mensagem'', format(''Carga #%s liberada para o embarque com %s volume(s).'', v_c.numero_carga, v_n)');
  IF n = d OR position('''VOLUME''' IN n) = 0 THEN RAISE EXCEPTION 'carga_liberar: padrão não encontrado'; END IF;
  EXECUTE n;
END $$;

-- ---------- gerar volumes no embarque (pedido sem volume) ----------
CREATE OR REPLACE FUNCTION public.embarque_gerar_volumes(p_tenant_id uuid, p_carga_id uuid, p_usuario_id uuid,
  p_carga_documento_id uuid, p_quantidade integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_u uuid; v_c record; v_cd record; v_ids uuid[] := '{}'; v_id uuid; i integer; v_vols jsonb;
BEGIN
  v_u := public._fn_carga_autorizar(p_tenant_id, p_usuario_id, true);
  SELECT c.* INTO v_c FROM carga c WHERE c.id = p_carga_id AND c.tenant_id = p_tenant_id FOR UPDATE;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'CARGA_NAO_ENCONTRADA: carga não encontrada.'; END IF;
  IF v_c.status NOT IN ('LIBERADA','EM_CARREGAMENTO') THEN
    RAISE EXCEPTION 'EMBARQUE_CARGA_INDISPONIVEL: a carga #% está em %.', v_c.numero_carga, v_c.status;
  END IF;
  PERFORM public._fn_embarque_checar_veiculo(p_carga_id);
  IF p_quantidade IS NULL OR p_quantidade < 1 OR p_quantidade > 999 THEN
    RAISE EXCEPTION 'EMBARQUE_QUANTIDADE_INVALIDA: informe de 1 a 999 volumes.';
  END IF;
  SELECT cd.*, ds.numero_pedido, ms.numero_onda INTO v_cd FROM carga_documento cd
    JOIN documento_saida ds ON ds.id = cd.documento_saida_id JOIN movimento_saida ms ON ms.id = cd.movimento_saida_id
   WHERE cd.id = p_carga_documento_id AND cd.carga_id = p_carga_id AND cd.ativo;
  IF v_cd.id IS NULL THEN RAISE EXCEPTION 'EMBARQUE_PEDIDO_FORA_DA_CARGA: o pedido não faz parte desta carga.'; END IF;
  IF EXISTS (SELECT 1 FROM carga_unidade cu WHERE cu.carga_documento_id = v_cd.id AND cu.status <> 'CANCELADA') THEN
    RAISE EXCEPTION 'EMBARQUE_VOLUMES_JA_GERADOS: o pedido % já tem volumes; bipe as etiquetas dele.', v_cd.numero_pedido;
  END IF;

  FOR i IN 1..p_quantidade LOOP
    INSERT INTO volume_expedicao (tenant_id, empresa_id, movimento_saida_id, documento_saida_id, codigo_volume, numero_volume, status, created_by)
    VALUES (v_c.tenant_id, v_c.empresa_id, v_cd.movimento_saida_id, v_cd.documento_saida_id,
            'VOL-' || lpad(nextval('volume_expedicao_codigo_seq')::text, 6, '0'), i, 'ABERTO', v_u)
    RETURNING id INTO v_id;
    v_ids := v_ids || v_id;
  END LOOP;
  PERFORM public._fn_carga_gerar_unidades(p_carga_id, ARRAY[v_cd.movimento_saida_id]);
  PERFORM public._fn_carga_recalcular(p_carga_id);
  PERFORM public._fn_carga_registrar_evento(p_carga_id, 'VOLUMES_GERADOS', v_u,
    jsonb_build_object('carga_documento_id', v_cd.id, 'documento_saida_id', v_cd.documento_saida_id, 'quantidade', p_quantidade));

  SELECT jsonb_agg(jsonb_build_object('id', v.id, 'codigo_volume', v.codigo_volume, 'numero_volume', v.numero_volume,
           'total_volumes', p_quantidade, 'numero_pedido', v_cd.numero_pedido, 'numero_onda', v_cd.numero_onda) ORDER BY v.numero_volume)
    INTO v_vols FROM volume_expedicao v WHERE v.id = ANY(v_ids);
  RETURN jsonb_build_object('sucesso', true, 'codigo', 'EMBARQUE_VOLUMES_GERADOS',
    'mensagem', format('%s volume(s) gerado(s) para o pedido %s. Cole as etiquetas e bipe cada uma ao carregar.', p_quantidade, v_cd.numero_pedido),
    'dados', jsonb_build_object('volumes', v_vols));
EXCEPTION WHEN raise_exception THEN RETURN public._fn_carga_erro(SQLERRM);
END $$;

-- ---------- bipar: veículo confirmado, leitura obrigatória para volume, código digitado registrado ----------
DROP FUNCTION IF EXISTS public.embarque_bipar_unidade(uuid,uuid,uuid,text,uuid);
CREATE OR REPLACE FUNCTION public.embarque_bipar_unidade(p_tenant_id uuid, p_carga_id uuid, p_usuario_id uuid,
  p_codigo text DEFAULT NULL::text, p_carga_unidade_id uuid DEFAULT NULL::uuid, p_digitado boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_u uuid; v_c record; v_cod text := upper(btrim(COALESCE(p_codigo, ''))); v_un record; v_outra bigint;
  v_aviso jsonb; v_total integer; v_emb integer; v_doc_completo boolean := false; v_doc_tot integer; v_doc_emb integer;
BEGIN
  v_u := public._fn_carga_autorizar(p_tenant_id, p_usuario_id, true);
  IF v_cod = '' AND p_carga_unidade_id IS NULL THEN RAISE EXCEPTION 'EMBARQUE_CODIGO_VAZIO: leia a etiqueta do volume.'; END IF;

  SELECT c.* INTO v_c FROM carga c WHERE c.id = p_carga_id AND c.tenant_id = p_tenant_id FOR UPDATE;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'CARGA_NAO_ENCONTRADA: carga não encontrada.'; END IF;
  IF v_c.status NOT IN ('LIBERADA','EM_CARREGAMENTO') THEN
    RAISE EXCEPTION 'EMBARQUE_CARGA_INDISPONIVEL: a carga #% está em % e não aceita embarque.', v_c.numero_carga, v_c.status;
  END IF;
  PERFORM public._fn_embarque_checar_veiculo(p_carga_id);

  SELECT cu.* INTO v_un
    FROM carga_unidade cu
    LEFT JOIN carga_documento cd ON cd.id = cu.carga_documento_id
    LEFT JOIN documento_saida ds ON ds.id = cd.documento_saida_id
   WHERE cu.carga_id = p_carga_id AND cu.status <> 'CANCELADA'
     AND (cu.id = p_carga_unidade_id
          OR (v_cod <> '' AND (upper(cu.codigo) = v_cod
              OR (cu.tipo IN ('DOCUMENTO','CONFIRMACAO') AND upper(COALESCE(ds.codigo_erp, '')) = v_cod))))
   ORDER BY (cu.status = 'PENDENTE') DESC, cu.sequencia
   LIMIT 1;

  IF v_un.id IS NULL THEN
    SELECT c2.numero_carga INTO v_outra
      FROM carga_unidade cu JOIN carga c2 ON c2.id = cu.carga_id
     WHERE cu.tenant_id = p_tenant_id AND cu.status <> 'CANCELADA' AND upper(cu.codigo) = v_cod
       AND c2.id <> p_carga_id AND c2.status IN ('EM_MONTAGEM','LIBERADA','EM_CARREGAMENTO')
     LIMIT 1;
    IF v_outra IS NOT NULL THEN
      RAISE EXCEPTION 'EMBARQUE_UNIDADE_OUTRA_CARGA: este volume pertence à carga #%. Não embarque neste veículo.', v_outra;
    END IF;
    RAISE EXCEPTION 'EMBARQUE_CODIGO_NAO_ENCONTRADO: o código % não é volume desta carga.', COALESCE(NULLIF(v_cod, ''), '(vazio)');
  END IF;
  -- volume só entra pela leitura (ou digitação) da etiqueta
  IF v_un.tipo IN ('VOLUME','HU') AND (v_cod = '' OR upper(v_un.codigo) <> v_cod) THEN
    RAISE EXCEPTION 'EMBARQUE_LEITURA_OBRIGATORIA: bipe a etiqueta do volume para embarcá-lo.';
  END IF;
  IF v_un.status = 'EMBARCADA' THEN
    RAISE EXCEPTION 'EMBARQUE_JA_EMBARCADA: % já está no veículo.', COALESCE(v_un.descricao, v_un.codigo);
  END IF;

  IF EXISTS (SELECT 1 FROM carga_unidade x WHERE x.carga_id = p_carga_id AND x.status = 'PENDENTE' AND x.sequencia < v_un.sequencia) THEN
    v_aviso := jsonb_build_object('codigo', 'EMBARQUE_FORA_DE_ORDEM',
      'mensagem', 'Volume embarcado fora da ordem definida para a carga.');
  END IF;

  INSERT INTO tarefa_execucao (tenant_id, tarefa_id, usuario_id, status, atribuido_em, iniciado_em, concluido_em, quantidade_executada, hu)
  VALUES (p_tenant_id, v_un.tarefa_id, v_u, 'CONCLUIDA', now(), now(), now(), 1, CASE WHEN v_un.tipo = 'HU' THEN v_un.referencia_id END);
  UPDATE tarefa SET status = 'CONCLUIDA', quantidade_executada = 1, concluido_em = now()
   WHERE id = v_un.tarefa_id AND status <> 'CONCLUIDA';
  UPDATE carga_unidade SET status = 'EMBARCADA', embarcada_em = now(), embarcada_por = v_u, updated_by = v_u WHERE id = v_un.id;
  IF v_un.tipo = 'VOLUME' THEN
    UPDATE volume_expedicao SET status = 'EXPEDIDO' WHERE id = v_un.referencia_id AND status <> 'EXPEDIDO';
  END IF;
  IF p_digitado THEN
    PERFORM public._fn_carga_registrar_evento(p_carga_id, 'VOLUME_DIGITADO', v_u, jsonb_build_object('carga_unidade_id', v_un.id, 'codigo', v_un.codigo));
  END IF;

  IF v_c.status = 'LIBERADA' THEN
    UPDATE carga SET status = 'EM_CARREGAMENTO', iniciada_em = now(), updated_by = v_u WHERE id = p_carga_id;
  END IF;
  UPDATE movimento_saida SET status = 'EM_CARREGAMENTO'
   WHERE id = v_un.movimento_saida_id AND status IN ('CONFERIDO','SEPARADO');

  IF v_un.carga_documento_id IS NOT NULL THEN
    SELECT count(*) FILTER (WHERE x.status <> 'CANCELADA'), count(*) FILTER (WHERE x.status = 'EMBARCADA')
      INTO v_doc_tot, v_doc_emb FROM carga_unidade x WHERE x.carga_documento_id = v_un.carga_documento_id;
    IF v_doc_tot = v_doc_emb THEN
      UPDATE carga_documento SET embarcado_em = now(), updated_by = v_u WHERE id = v_un.carga_documento_id AND embarcado_em IS NULL;
      v_doc_completo := true;
    END IF;
  END IF;

  SELECT count(*) FILTER (WHERE status <> 'CANCELADA'), count(*) FILTER (WHERE status = 'EMBARCADA')
    INTO v_total, v_emb FROM carga_unidade WHERE carga_id = p_carga_id;

  RETURN jsonb_build_object('sucesso', true, 'codigo', 'EMBARQUE_REGISTRADO',
    'mensagem', format('%s: embarque registrado.', COALESCE(v_un.descricao, v_un.codigo)),
    'aviso', v_aviso,
    'dados', jsonb_build_object('unidade_id', v_un.id, 'codigo', v_un.codigo, 'descricao', v_un.descricao,
      'documento_completo', v_doc_completo, 'documento_total', v_doc_tot, 'documento_embarcadas', v_doc_emb,
      'total', v_total, 'embarcadas', v_emb,
      'carga_completa', v_total = v_emb AND NOT EXISTS (
         SELECT 1 FROM carga_documento cd WHERE cd.carga_id = p_carga_id AND cd.ativo
            AND NOT EXISTS (SELECT 1 FROM carga_unidade x WHERE x.carga_documento_id = cd.id AND x.status <> 'CANCELADA'))));
EXCEPTION WHEN raise_exception THEN RETURN public._fn_carga_erro(SQLERRM);
END $$;

-- ---------- fechar: todo pedido precisa ter volumes ----------
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.embarque_fechar_carga(uuid,uuid,uuid)'::regprocedure);
  n := replace(d, '  IF NOT EXISTS (SELECT 1 FROM carga_unidade cu WHERE cu.carga_id = p_carga_id AND cu.status = ''EMBARCADA'') THEN',
'  SELECT string_agg(COALESCE(ds.numero_pedido::text, ds.codigo_erp, ''?''), '', '') INTO v_faltam
    FROM carga_documento cd JOIN documento_saida ds ON ds.id = cd.documento_saida_id
   WHERE cd.carga_id = p_carga_id AND cd.ativo
     AND NOT EXISTS (SELECT 1 FROM carga_unidade cu WHERE cu.carga_documento_id = cd.id AND cu.status <> ''CANCELADA'');
  IF v_faltam IS NOT NULL THEN
    RAISE EXCEPTION ''EMBARQUE_PEDIDO_SEM_VOLUMES: gere e bipe os volumes do(s) pedido(s) %.'', v_faltam;
  END IF;
  v_faltam := NULL;
  IF NOT EXISTS (SELECT 1 FROM carga_unidade cu WHERE cu.carga_id = p_carga_id AND cu.status = ''EMBARCADA'') THEN');
  IF n = d THEN RAISE EXCEPTION 'embarque_fechar_carga: padrão não encontrado'; END IF;
  EXECUTE n;
END $$;

-- ---------- detalhe e coletor: confirmação do veículo e volumes por pedido ----------
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public._fn_carga_detalhe(uuid)'::regprocedure);
  n := replace(d, '''modalidade'', c.modalidade,',
    '''modalidade'', c.modalidade, ''exige_confirmacao_veiculo'', public._fn_carga_exige_confirmacao_veiculo(c.id),
    ''veiculo_confirmado_em'', c.veiculo_confirmado_em, ''veiculo_confirmado_por_nome'', (SELECT x.nome FROM usuario x WHERE x.id = c.veiculo_confirmado_por),');
  IF n = d THEN RAISE EXCEPTION '_fn_carga_detalhe: padrão não encontrado'; END IF;
  EXECUTE n;

  d := pg_get_functiondef('public.embarque_obter_carga(uuid,uuid,uuid)'::regprocedure);
  n := replace(d, '''id'', cu.id, ''tipo'', cu.tipo,', '''id'', cu.id, ''carga_documento_id'', cu.carga_documento_id, ''tipo'', cu.tipo,');
  IF n = d THEN RAISE EXCEPTION 'embarque_obter_carga: padrão não encontrado'; END IF;
  EXECUTE n;
END $$;

-- ---------- conferência: volume nasce ligado ao pedido quando a onda tem um pedido só ----------
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.gerar_volumes_expedicao(uuid,uuid,uuid,integer,text)'::regprocedure);
  n := replace(d, E'      numero_volume,\n      status\n    )', E'      numero_volume,\n      status,\n      documento_saida_id\n    )');
  n := replace(n, E'      i,\n      ''ABERTO''::enum_status_volume\n    )',
    E'      i,\n      ''ABERTO''::enum_status_volume,\n      (SELECT CASE WHEN count(*) = 1 THEN min(msd.documento_saida_id::text)::uuid END\n         FROM movimento_saida_documento msd WHERE msd.movimento_saida_id = p_movimento_saida_id)\n    )');
  IF position('documento_saida_id' IN n) = 0 OR (length(n) - length(replace(n, 'documento_saida_id', ''))) / 18 < 2 THEN
    RAISE EXCEPTION 'gerar_volumes_expedicao: padrão não encontrado';
  END IF;
  EXECUTE n;
END $$;

-- ---------- grants ----------
REVOKE ALL ON FUNCTION public._fn_gerar_codigo_veiculo() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_carga_registrar_evento(uuid,text,uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_carga_exige_confirmacao_veiculo(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_embarque_checar_veiculo(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.veiculo_gerar_novo_codigo(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.veiculo_gerar_novo_codigo(uuid,uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.embarque_confirmar_veiculo(uuid,uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.embarque_confirmar_veiculo(uuid,uuid,uuid,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.embarque_gerar_volumes(uuid,uuid,uuid,uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.embarque_gerar_volumes(uuid,uuid,uuid,uuid,integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.embarque_bipar_unidade(uuid,uuid,uuid,text,uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.embarque_bipar_unidade(uuid,uuid,uuid,text,uuid,boolean) TO authenticated, service_role;
GRANT SELECT ON public.carga_evento TO authenticated;
