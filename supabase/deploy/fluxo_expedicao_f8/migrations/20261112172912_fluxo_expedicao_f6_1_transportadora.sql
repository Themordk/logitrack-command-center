-- =====================================================================
-- Fluxo de Expedição — F6.1 Modalidade de transporte · 2026-11-12
-- ---------------------------------------------------------------------
-- A carga passa a ter modalidade:
--   PROPRIA  -> veículo da tabela veiculos (obrigatório para liberar; capacidade do cadastro)
--   TERCEIRO -> transportadora da tabela parceiro (eh_transportador), com placa, motorista e
--               documento do motorista digitados na carga.
-- Decisões (12/11):
--   1. Placa e motorista da transportadora: não exigidos para liberar; exigidos para FECHAR.
--   2. Pedido sem transportadora reconhecida não bloqueia; o supervisor escolhe na montagem.
--   3. Veículos de transportadora não são cadastrados (placa digitada na carga).
-- A transportadora do pedido vem de documento_saida.transportador (texto do ERP), reconhecida
-- por código ERP, código Omie, CNPJ, razão social ou nome fantasia. Pedidos de transportadoras
-- diferentes não entram na mesma carga.
-- Reversão: 20261112_fluxo_expedicao_f6_1_down.sql
-- =====================================================================

ALTER TABLE public.carga
  ADD COLUMN IF NOT EXISTS modalidade text NOT NULL DEFAULT 'PROPRIA'
      CONSTRAINT ck_carga_modalidade CHECK (modalidade IN ('PROPRIA','TERCEIRO')),
  ADD COLUMN IF NOT EXISTS transportadora_id uuid REFERENCES public.parceiro(id),
  ADD COLUMN IF NOT EXISTS placa text,
  ADD COLUMN IF NOT EXISTS motorista_documento text;
CREATE INDEX IF NOT EXISTS idx_carga_transportadora ON public.carga (transportadora_id) WHERE transportadora_id IS NOT NULL;
COMMENT ON COLUMN public.carga.modalidade IS 'PROPRIA = veículo próprio (veiculos); TERCEIRO = transportadora (parceiro eh_transportador).';
COMMENT ON COLUMN public.carga.placa IS 'Placa do veículo da transportadora (modalidade TERCEIRO). Obrigatória para fechar.';

-- Transportadora reconhecida a partir do texto que o ERP grava no pedido
CREATE OR REPLACE FUNCTION public._fn_carga_doc_transportadora(p_documento_saida_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p.id
    FROM documento_saida d
    JOIN parceiro p ON p.tenant_id = d.tenant_id AND p.eh_transportador AND COALESCE(p.ativo, true)
                   AND (p.empresa_id IS NULL OR p.empresa_id = d.empresa_id)
   WHERE d.id = p_documento_saida_id
     AND NULLIF(btrim(d.transportador), '') IS NOT NULL
     AND (   p.codigo_erp = btrim(d.transportador)
          OR p.codigo_erp_omie = btrim(d.transportador)
          OR (length(regexp_replace(COALESCE(p.cnpj, ''), '\D', '', 'g')) >= 11
              AND regexp_replace(p.cnpj, '\D', '', 'g') = regexp_replace(d.transportador, '\D', '', 'g'))
          OR upper(btrim(p.razaosocial)) = upper(btrim(d.transportador))
          OR upper(btrim(p.nome_fantasia)) = upper(btrim(d.transportador)))
   ORDER BY (p.codigo_erp = btrim(d.transportador)) DESC NULLS LAST, (p.empresa_id IS NOT NULL) DESC
   LIMIT 1;
$$;

-- Transportadoras distintas reconhecidas nos pedidos de uma onda
CREATE OR REPLACE FUNCTION public._fn_carga_onda_transportadoras(p_movimento_saida_id uuid)
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(array_agg(DISTINCT t) FILTER (WHERE t IS NOT NULL), '{}')
    FROM (SELECT public._fn_carga_doc_transportadora(msd.documento_saida_id) AS t
            FROM movimento_saida_documento msd WHERE msd.movimento_saida_id = p_movimento_saida_id) z;
$$;

CREATE OR REPLACE FUNCTION public._fn_carga_nome_parceiros(p_ids uuid[])
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT string_agg(COALESCE(p.nome_fantasia, p.razaosocial), ', ' ORDER BY COALESCE(p.nome_fantasia, p.razaosocial))
    FROM parceiro p WHERE p.id = ANY(p_ids);
$$;

-- ---------- detalhe ----------
CREATE OR REPLACE FUNCTION public._fn_carga_detalhe(p_carga_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'id', c.id, 'numero_carga', c.numero_carga, 'status', c.status, 'empresa_id', c.empresa_id,
    'modalidade', c.modalidade, 'placa', COALESCE(c.placa, v.placa), 'motorista_documento', c.motorista_documento,
    'motorista', c.motorista, 'observacao', c.observacao, 'unidade_embarque', c.unidade_embarque,
    'peso_total', c.peso_total, 'm3_total', c.m3_total, 'volumes_total', c.volumes_total, 'pallets_total', c.pallets_total,
    'created_at', c.created_at, 'liberada_em', c.liberada_em, 'iniciada_em', c.iniciada_em, 'fechada_em', c.fechada_em,
    'cancelada_em', c.cancelada_em, 'motivo_cancelamento', c.motivo_cancelamento,
    'montada_por_nome', um.nome, 'fechada_por_nome', uf.nome,
    'veiculo', CASE WHEN v.id IS NULL THEN NULL ELSE jsonb_build_object('id', v.id, 'descricao', v.descricao, 'placa', v.placa,
                 'm3', v.m3, 'peso_total', v.peso_total, 'total_pallet', v.total_pallet) END,
    'transportadora', CASE WHEN tp.id IS NULL THEN NULL ELSE jsonb_build_object('id', tp.id, 'razaosocial', tp.razaosocial,
                 'nome_fantasia', tp.nome_fantasia, 'cnpj', tp.cnpj) END,
    'transportadoras_pedidos', (SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object('id', p.id, 'nome', COALESCE(p.nome_fantasia, p.razaosocial))), '[]'::jsonb)
                 FROM carga_documento cd2 JOIN parceiro p ON p.id = public._fn_carga_doc_transportadora(cd2.documento_saida_id)
                WHERE cd2.carga_id = c.id AND cd2.ativo),
    'box', CASE WHEN b.id IS NULL THEN NULL ELSE jsonb_build_object('id', b.id, 'descricao', b.descricao) END,
    'capacidade', jsonb_build_object(
       'peso_pct',    CASE WHEN COALESCE(v.peso_total, 0) > 0 THEN round(c.peso_total / v.peso_total * 100, 1) END,
       'm3_pct',      CASE WHEN COALESCE(v.m3, 0) > 0 THEN round(c.m3_total / v.m3 * 100, 1) END,
       'pallets_pct', CASE WHEN COALESCE(v.total_pallet, 0) > 0 THEN round(c.pallets_total::numeric / v.total_pallet * 100, 1) END,
       'excedida', (COALESCE(v.peso_total, 0) > 0 AND c.peso_total > v.peso_total)
                OR (COALESCE(v.m3, 0) > 0 AND c.m3_total > v.m3)
                OR (COALESCE(v.total_pallet, 0) > 0 AND c.pallets_total > v.total_pallet)),
    'pendencias_fechamento', to_jsonb(array_remove(ARRAY[
       CASE WHEN c.modalidade = 'TERCEIRO' AND NULLIF(btrim(c.placa), '') IS NULL THEN 'Placa do veículo da transportadora' END,
       CASE WHEN c.modalidade = 'TERCEIRO' AND NULLIF(btrim(c.motorista), '') IS NULL THEN 'Nome do motorista' END,
       CASE WHEN c.modalidade = 'TERCEIRO' AND NULLIF(btrim(c.motorista_documento), '') IS NULL THEN 'Documento do motorista' END
     ], NULL)),
    'progresso', (SELECT jsonb_build_object('total', count(*) FILTER (WHERE cu.status <> 'CANCELADA'),
                                            'embarcadas', count(*) FILTER (WHERE cu.status = 'EMBARCADA'))
                    FROM carga_unidade cu WHERE cu.carga_id = c.id),
    'ondas', COALESCE((SELECT jsonb_agg(jsonb_build_object('movimento_saida_id', ms.id, 'numero_onda', ms.numero_onda,
                         'status', ms.status, 'peso_total', ms.peso_total, 'm3', ms.m3,
                         'documentos', (SELECT count(*) FROM carga_documento x WHERE x.carga_id = c.id AND x.ativo AND x.movimento_saida_id = ms.id)
                       ) ORDER BY ms.numero_onda)
                FROM movimento_saida ms
               WHERE ms.id IN (SELECT cd.movimento_saida_id FROM carga_documento cd WHERE cd.carga_id = c.id AND cd.ativo)), '[]'::jsonb),
    'documentos', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                         'carga_documento_id', cd.id, 'sequencia', cd.sequencia, 'documento_saida_id', ds.id,
                         'numero_pedido', ds.numero_pedido, 'codigo_erp', ds.codigo_erp, 'valor_pedido', ds.valor_pedido,
                         'parceiro', COALESCE(p.nome_fantasia, p.razaosocial), 'cidade', p.cidade, 'uf', p.estado,
                         'transportador_erp', NULLIF(btrim(ds.transportador), ''),
                         'movimento_saida_id', cd.movimento_saida_id, 'numero_onda', ms.numero_onda,
                         'unidades_total', (SELECT count(*) FROM carga_unidade cu WHERE cu.carga_documento_id = cd.id AND cu.status <> 'CANCELADA'),
                         'unidades_embarcadas', (SELECT count(*) FROM carga_unidade cu WHERE cu.carga_documento_id = cd.id AND cu.status = 'EMBARCADA'),
                         'embarcado_em', cd.embarcado_em) ORDER BY cd.sequencia)
                FROM carga_documento cd
                JOIN documento_saida ds ON ds.id = cd.documento_saida_id
                JOIN movimento_saida ms ON ms.id = cd.movimento_saida_id
                LEFT JOIN parceiro p ON p.id = ds.parceiro_id
               WHERE cd.carga_id = c.id AND cd.ativo), '[]'::jsonb),
    'acoes', jsonb_build_object(
       'editar',    c.status IN ('EM_MONTAGEM','LIBERADA','EM_CARREGAMENTO'),
       'editar_ondas', c.status IN ('EM_MONTAGEM','LIBERADA'),
       'reordenar', c.status IN ('EM_MONTAGEM','LIBERADA','EM_CARREGAMENTO'),
       'liberar',   c.status = 'EM_MONTAGEM',
       'fechar',    c.status IN ('LIBERADA','EM_CARREGAMENTO'),
       'cancelar',  c.status IN ('EM_MONTAGEM','LIBERADA','EM_CARREGAMENTO')
                    AND NOT EXISTS (SELECT 1 FROM carga_unidade cu WHERE cu.carga_id = c.id AND cu.status = 'EMBARCADA'))
  )
  FROM carga c
  LEFT JOIN veiculos v ON v.id = c.veiculo_id
  LEFT JOIN parceiro tp ON tp.id = c.transportadora_id
  LEFT JOIN box b ON b.id = c.box_id
  LEFT JOIN usuario um ON um.id = c.montada_por
  LEFT JOIN usuario uf ON uf.id = c.fechada_por
  WHERE c.id = p_carga_id;
$$;

-- ---------- montar (nova assinatura) ----------
DROP FUNCTION IF EXISTS public.carga_montar(uuid,uuid,uuid,uuid,uuid[],uuid,uuid,text,text);
CREATE OR REPLACE FUNCTION public.carga_montar(
  p_tenant_id uuid, p_empresa_id uuid, p_usuario_id uuid,
  p_carga_id uuid DEFAULT NULL, p_ondas uuid[] DEFAULT '{}',
  p_veiculo_id uuid DEFAULT NULL, p_box_id uuid DEFAULT NULL,
  p_motorista text DEFAULT NULL, p_observacao text DEFAULT NULL,
  p_modalidade text DEFAULT NULL, p_transportadora_id uuid DEFAULT NULL,
  p_placa text DEFAULT NULL, p_motorista_documento text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_u uuid; v_c record; v_carga uuid := p_carga_id; v_onda record; v_motivo text; v_status text;
  v_c_veic uuid; v_c_box uuid; v_c_modal text; v_c_transp uuid; v_numero bigint;
  v_veics uuid[]; v_boxes uuid[]; v_transps uuid[]; v_modal text; v_transp uuid; v_veic uuid;
  v_seq integer; v_novas uuid[] := '{}'; v_avisos jsonb := '[]'::jsonb; v_det jsonb;
BEGIN
  v_u := public._fn_carga_autorizar(p_tenant_id, p_usuario_id, false);

  IF p_empresa_id IS NULL OR NOT EXISTS (SELECT 1 FROM empresa e WHERE e.id = p_empresa_id AND e.tenant_id = p_tenant_id) THEN
    RAISE EXCEPTION 'CARGA_EMPRESA_INVALIDA: empresa não encontrada neste tenant.';
  END IF;
  IF p_modalidade IS NOT NULL AND p_modalidade NOT IN ('PROPRIA','TERCEIRO') THEN
    RAISE EXCEPTION 'CARGA_MODALIDADE_INVALIDA: use PROPRIA (veículo próprio) ou TERCEIRO (transportadora).';
  END IF;
  IF p_veiculo_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM veiculos v WHERE v.id = p_veiculo_id AND v.tenant_id = p_tenant_id AND COALESCE(v.ativo, true)) THEN
    RAISE EXCEPTION 'CARGA_VEICULO_INVALIDO: veículo não encontrado ou inativo.';
  END IF;
  IF p_transportadora_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM parceiro p WHERE p.id = p_transportadora_id AND p.tenant_id = p_tenant_id
                                                       AND p.eh_transportador AND COALESCE(p.ativo, true)) THEN
    RAISE EXCEPTION 'CARGA_TRANSPORTADORA_INVALIDA: o parceiro escolhido não está cadastrado como transportador ativo.';
  END IF;
  IF p_box_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM box b WHERE b.id = p_box_id AND b.tenant_id = p_tenant_id AND COALESCE(b.ativo, true)) THEN
    RAISE EXCEPTION 'CARGA_BOX_INVALIDO: box não encontrado ou inativo.';
  END IF;

  IF v_carga IS NOT NULL THEN
    SELECT c.* INTO v_c FROM carga c WHERE c.id = v_carga AND c.tenant_id = p_tenant_id FOR UPDATE;
    IF v_c.id IS NULL THEN RAISE EXCEPTION 'CARGA_NAO_ENCONTRADA: carga não encontrada.'; END IF;
    IF v_c.empresa_id <> p_empresa_id THEN RAISE EXCEPTION 'CARGA_EMPRESA_DIVERGENTE: a carga é de outra empresa.'; END IF;
    IF v_c.status NOT IN ('EM_MONTAGEM','LIBERADA','EM_CARREGAMENTO') THEN
      RAISE EXCEPTION 'CARGA_NAO_EDITAVEL: a carga #% está em % e não aceita alterações.', v_c.numero_carga, v_c.status;
    END IF;
    IF v_c.status = 'EM_CARREGAMENTO' AND array_length(p_ondas, 1) IS NOT NULL THEN
      RAISE EXCEPTION 'CARGA_NAO_EDITAVEL: a carga #% já está em carregamento e não recebe novas ondas.', v_c.numero_carga;
    END IF;
    IF v_c.status = 'EM_CARREGAMENTO' AND (
         (p_modalidade IS NOT NULL AND p_modalidade <> v_c.modalidade)
      OR (p_veiculo_id IS NOT NULL AND p_veiculo_id IS DISTINCT FROM v_c.veiculo_id)
      OR (p_transportadora_id IS NOT NULL AND p_transportadora_id IS DISTINCT FROM v_c.transportadora_id)
      OR (p_box_id IS NOT NULL AND p_box_id IS DISTINCT FROM v_c.box_id)) THEN
      RAISE EXCEPTION 'CARGA_NAO_EDITAVEL: a carga #% já está em carregamento; só placa, motorista e observação podem mudar.', v_c.numero_carga;
    END IF;
    v_c_veic := v_c.veiculo_id; v_c_box := v_c.box_id; v_c_modal := v_c.modalidade; v_c_transp := v_c.transportadora_id;
    v_status := v_c.status; v_numero := v_c.numero_carga;
  END IF;

  FOR v_onda IN SELECT ms.id, ms.numero_onda, ms.empresa_id FROM movimento_saida ms
                 WHERE ms.id = ANY(COALESCE(p_ondas, '{}')) ORDER BY ms.numero_onda FOR UPDATE LOOP
    IF v_onda.empresa_id <> p_empresa_id THEN
      RAISE EXCEPTION 'CARGA_EMPRESA_DIVERGENTE: a onda #% é de outra empresa.', v_onda.numero_onda;
    END IF;
    IF EXISTS (SELECT 1 FROM carga_documento cd WHERE cd.movimento_saida_id = v_onda.id AND cd.ativo AND cd.carga_id IS DISTINCT FROM v_carga) THEN
      RAISE EXCEPTION 'CARGA_ONDA_EM_OUTRA_CARGA: a onda #% já está na carga #%.', v_onda.numero_onda,
        (SELECT c2.numero_carga FROM carga_documento cd JOIN carga c2 ON c2.id = cd.carga_id WHERE cd.movimento_saida_id = v_onda.id AND cd.ativo LIMIT 1);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM carga_documento cd WHERE cd.movimento_saida_id = v_onda.id AND cd.ativo AND cd.carga_id = v_carga) THEN
      v_motivo := public._fn_carga_onda_motivo(v_onda.id);
      IF v_motivo IS NOT NULL THEN RAISE EXCEPTION 'CARGA_ONDA_INELEGIVEL: %.', v_motivo; END IF;
      v_novas := v_novas || v_onda.id;
    END IF;
  END LOOP;
  IF array_length(p_ondas, 1) IS NOT NULL AND (SELECT count(*) FROM movimento_saida ms WHERE ms.id = ANY(p_ondas) AND ms.tenant_id = p_tenant_id) <> (SELECT count(DISTINCT x) FROM unnest(p_ondas) x) THEN
    RAISE EXCEPTION 'CARGA_ONDA_INVALIDA: uma ou mais ondas não foram encontradas.';
  END IF;

  -- transportadoras reconhecidas nos pedidos (novos + já na carga)
  SELECT COALESCE(array_agg(DISTINCT t) FILTER (WHERE t IS NOT NULL), '{}') INTO v_transps FROM (
    SELECT public._fn_carga_doc_transportadora(msd.documento_saida_id) AS t FROM movimento_saida_documento msd WHERE msd.movimento_saida_id = ANY(v_novas)
    UNION ALL
    SELECT public._fn_carga_doc_transportadora(cd.documento_saida_id) FROM carga_documento cd WHERE cd.carga_id = v_carga AND cd.ativo) z;
  IF array_length(v_transps, 1) > 1 THEN
    RAISE EXCEPTION 'CARGA_TRANSPORTADORA_DIVERGENTE: os pedidos são de transportadoras diferentes (%); monte uma carga por transportadora.',
      public._fn_carga_nome_parceiros(v_transps);
  END IF;

  v_modal := COALESCE(p_modalidade, v_c_modal,
                      CASE WHEN p_veiculo_id IS NULL AND (p_transportadora_id IS NOT NULL OR array_length(v_transps, 1) = 1) THEN 'TERCEIRO' ELSE 'PROPRIA' END);

  IF v_modal = 'PROPRIA' THEN
    SELECT array_agg(DISTINCT x) FILTER (WHERE x IS NOT NULL) INTO v_veics FROM (
      SELECT ms.veiculo_id AS x FROM movimento_saida ms WHERE ms.id = ANY(v_novas)
      UNION ALL SELECT ms.veiculo_id FROM movimento_saida ms JOIN carga_documento cd ON cd.movimento_saida_id = ms.id AND cd.ativo WHERE cd.carga_id = v_carga
      UNION ALL SELECT COALESCE(p_veiculo_id, v_c_veic)) z;
    IF COALESCE(array_length(v_veics, 1), 0) > 1 THEN
      RAISE EXCEPTION 'CARGA_VEICULO_DIVERGENTE: as ondas e a carga indicam veículos diferentes; uma carga sai num veículo só.';
    END IF;
    v_veic := v_veics[1]; v_transp := NULL;
  ELSE
    v_veic := NULL;
    v_transp := COALESCE(p_transportadora_id, v_c_transp, v_transps[1]);
    IF v_transp IS NOT NULL AND array_length(v_transps, 1) = 1 AND v_transps[1] <> v_transp THEN
      v_avisos := v_avisos || jsonb_build_object('codigo', 'CARGA_TRANSPORTADORA_DIFERENTE_ERP',
        'mensagem', format('A transportadora escolhida é diferente da informada no ERP (%s).', public._fn_carga_nome_parceiros(v_transps)));
    END IF;
  END IF;

  SELECT array_agg(DISTINCT x) FILTER (WHERE x IS NOT NULL) INTO v_boxes FROM (
    SELECT ms.box_id AS x FROM movimento_saida ms WHERE ms.id = ANY(v_novas)
    UNION ALL SELECT ms.box_id FROM movimento_saida ms JOIN carga_documento cd ON cd.movimento_saida_id = ms.id AND cd.ativo WHERE cd.carga_id = v_carga
    UNION ALL SELECT COALESCE(p_box_id, v_c_box)) z;
  IF COALESCE(array_length(v_boxes, 1), 0) > 1 THEN
    RAISE EXCEPTION 'CARGA_BOX_DIVERGENTE: as ondas e a carga indicam boxes diferentes.';
  END IF;

  IF v_carga IS NULL THEN
    IF array_length(v_novas, 1) IS NULL THEN RAISE EXCEPTION 'CARGA_SEM_ONDAS: escolha ao menos uma onda para montar a carga.'; END IF;
    INSERT INTO carga (tenant_id, empresa_id, modalidade, veiculo_id, transportadora_id, placa, box_id,
                       motorista, motorista_documento, observacao, montada_por)
    VALUES (p_tenant_id, p_empresa_id, v_modal, v_veic, v_transp,
            CASE WHEN v_modal = 'TERCEIRO' THEN NULLIF(upper(btrim(p_placa)), '') END, v_boxes[1],
            NULLIF(btrim(p_motorista), ''), NULLIF(btrim(p_motorista_documento), ''), NULLIF(btrim(p_observacao), ''), v_u)
    RETURNING id, numero_carga, status INTO v_carga, v_numero, v_status;
  ELSE
    UPDATE carga SET modalidade = v_modal, veiculo_id = v_veic, transportadora_id = v_transp,
                     placa = CASE WHEN v_modal = 'TERCEIRO' THEN COALESCE(NULLIF(upper(btrim(p_placa)), ''), placa) END,
                     box_id = COALESCE(v_boxes[1], box_id),
                     motorista = COALESCE(NULLIF(btrim(p_motorista), ''), motorista),
                     motorista_documento = COALESCE(NULLIF(btrim(p_motorista_documento), ''), motorista_documento),
                     observacao = COALESCE(NULLIF(btrim(p_observacao), ''), observacao), updated_by = v_u
     WHERE id = v_carga;
  END IF;

  SELECT COALESCE(max(cd.sequencia), 0) INTO v_seq FROM carga_documento cd WHERE cd.carga_id = v_carga AND cd.ativo;
  INSERT INTO carga_documento (tenant_id, empresa_id, carga_id, movimento_saida_id, documento_saida_id, sequencia)
  SELECT p_tenant_id, p_empresa_id, v_carga, msd.movimento_saida_id, msd.documento_saida_id,
         v_seq + row_number() OVER (ORDER BY ms.numero_onda, msd.ordem NULLS LAST, msd.created_at)
    FROM movimento_saida_documento msd JOIN movimento_saida ms ON ms.id = msd.movimento_saida_id
   WHERE msd.movimento_saida_id = ANY(v_novas);

  IF v_status = 'LIBERADA' AND array_length(v_novas, 1) IS NOT NULL THEN
    PERFORM public._fn_carga_gerar_unidades(v_carga, v_novas);
  END IF;
  PERFORM public._fn_carga_recalcular(v_carga);

  v_det := public._fn_carga_detalhe(v_carga);
  IF (v_det #>> '{capacidade,excedida}')::boolean THEN
    v_avisos := v_avisos || jsonb_build_object('codigo', 'CARGA_EXCEDE_CAPACIDADE',
      'mensagem', 'A carga passou da capacidade do veículo (peso, m³ ou paletes).');
  END IF;
  IF v_modal = 'PROPRIA' AND v_det -> 'veiculo' = 'null'::jsonb THEN
    v_avisos := v_avisos || jsonb_build_object('codigo', 'CARGA_SEM_VEICULO', 'mensagem', 'Informe o veículo antes de liberar.');
  END IF;
  IF v_modal = 'TERCEIRO' AND v_transp IS NULL THEN
    v_avisos := v_avisos || jsonb_build_object('codigo', 'CARGA_SEM_TRANSPORTADORA',
      'mensagem', 'Os pedidos não trazem uma transportadora cadastrada; escolha a transportadora antes de liberar.');
  END IF;

  RETURN jsonb_build_object('sucesso', true, 'codigo', CASE WHEN p_carga_id IS NULL THEN 'CARGA_CRIADA' ELSE 'CARGA_ATUALIZADA' END,
    'mensagem', CASE WHEN p_carga_id IS NULL THEN format('Carga #%s montada.', v_numero) ELSE format('Carga #%s atualizada.', v_numero) END,
    'avisos', v_avisos, 'dados', v_det);
EXCEPTION WHEN raise_exception OR unique_violation THEN
  RETURN public._fn_carga_erro(CASE WHEN SQLSTATE = '23505' THEN 'CARGA_ONDA_EM_OUTRA_CARGA: um dos pedidos já entrou em outra carga; atualize a tela.' ELSE SQLERRM END);
END $$;

-- ---------- liberar: exige veículo (própria) ou transportadora (terceiro) ----------
CREATE OR REPLACE FUNCTION public.carga_liberar(p_tenant_id uuid, p_usuario_id uuid, p_carga_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_u uuid; v_c record; v_unid public.enum_unidade_embarque; v_n integer; v_inelegivel text;
BEGIN
  v_u := public._fn_carga_autorizar(p_tenant_id, p_usuario_id, false);
  SELECT c.* INTO v_c FROM carga c WHERE c.id = p_carga_id AND c.tenant_id = p_tenant_id FOR UPDATE;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'CARGA_NAO_ENCONTRADA: carga não encontrada.'; END IF;
  IF v_c.status <> 'EM_MONTAGEM' THEN RAISE EXCEPTION 'CARGA_JA_LIBERADA: a carga #% está em %.', v_c.numero_carga, v_c.status; END IF;
  IF NOT EXISTS (SELECT 1 FROM carga_documento cd WHERE cd.carga_id = p_carga_id AND cd.ativo) THEN
    RAISE EXCEPTION 'CARGA_SEM_ONDAS: a carga não tem pedidos.';
  END IF;
  IF v_c.modalidade = 'PROPRIA' AND v_c.veiculo_id IS NULL THEN
    RAISE EXCEPTION 'CARGA_SEM_VEICULO: informe o veículo antes de liberar a carga.';
  END IF;
  IF v_c.modalidade = 'TERCEIRO' AND v_c.transportadora_id IS NULL THEN
    RAISE EXCEPTION 'CARGA_SEM_TRANSPORTADORA: informe a transportadora antes de liberar a carga.';
  END IF;
  SELECT string_agg(m, '; ') INTO v_inelegivel FROM (
    SELECT DISTINCT public._fn_carga_onda_motivo(cd.movimento_saida_id) AS m
      FROM carga_documento cd WHERE cd.carga_id = p_carga_id AND cd.ativo) z WHERE m IS NOT NULL;
  IF v_inelegivel IS NOT NULL THEN RAISE EXCEPTION 'CARGA_ONDA_INELEGIVEL: %.', v_inelegivel; END IF;

  SELECT re.unidade_embarque INTO v_unid FROM roteiro_saida_embarque re
   WHERE re.tenant_id = p_tenant_id AND re.empresa_id = v_c.empresa_id;
  UPDATE carga SET status = 'LIBERADA', unidade_embarque = COALESCE(v_unid, 'CONFIRMACAO'),
                   liberada_em = now(), liberada_por = v_u, updated_by = v_u
   WHERE id = p_carga_id;
  v_n := public._fn_carga_gerar_unidades(p_carga_id, NULL);
  PERFORM public._fn_carga_recalcular(p_carga_id);

  RETURN jsonb_build_object('sucesso', true, 'codigo', 'CARGA_LIBERADA',
    'mensagem', format('Carga #%s liberada para o embarque com %s unidade(s).', v_c.numero_carga, v_n),
    'dados', public._fn_carga_detalhe(p_carga_id));
EXCEPTION WHEN raise_exception THEN RETURN public._fn_carga_erro(SQLERRM);
END $$;

-- ---------- fechar: transportadora exige placa, motorista e documento ----------
CREATE OR REPLACE FUNCTION public.embarque_fechar_carga(p_tenant_id uuid, p_carga_id uuid, p_usuario_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_u uuid; v_c record; v_pend integer; v_onda uuid; v_n integer := 0; v_faltam text;
BEGIN
  v_u := public._fn_carga_autorizar(p_tenant_id, p_usuario_id, true);
  SELECT c.* INTO v_c FROM carga c WHERE c.id = p_carga_id AND c.tenant_id = p_tenant_id FOR UPDATE;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'CARGA_NAO_ENCONTRADA: carga não encontrada.'; END IF;
  IF v_c.status = 'FECHADA' THEN
    RETURN jsonb_build_object('sucesso', true, 'codigo', 'CARGA_JA_FECHADA', 'mensagem', format('Carga #%s já estava fechada.', v_c.numero_carga),
      'dados', public._fn_carga_detalhe(p_carga_id));
  END IF;
  IF v_c.status NOT IN ('LIBERADA','EM_CARREGAMENTO') THEN
    RAISE EXCEPTION 'EMBARQUE_CARGA_INDISPONIVEL: a carga #% está em %.', v_c.numero_carga, v_c.status;
  END IF;
  SELECT count(*) INTO v_pend FROM carga_unidade cu WHERE cu.carga_id = p_carga_id AND cu.status = 'PENDENTE';
  IF v_pend > 0 THEN
    RAISE EXCEPTION 'EMBARQUE_PENDENTE: ainda faltam % unidade(s) para embarcar.', v_pend;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM carga_unidade cu WHERE cu.carga_id = p_carga_id AND cu.status = 'EMBARCADA') THEN
    RAISE EXCEPTION 'EMBARQUE_PENDENTE: nenhuma unidade foi embarcada.';
  END IF;
  SELECT string_agg(x, ', ') INTO v_faltam
    FROM jsonb_array_elements_text(public._fn_carga_detalhe(p_carga_id) -> 'pendencias_fechamento') x;
  IF v_faltam IS NOT NULL THEN
    RAISE EXCEPTION 'CARGA_TERCEIRO_SEM_DADOS: para fechar uma carga de transportadora, informe: %.', lower(v_faltam);
  END IF;

  UPDATE carga SET status = 'FECHADA', fechada_em = now(), fechada_por = v_u, updated_by = v_u WHERE id = p_carga_id;
  FOR v_onda IN SELECT DISTINCT cd.movimento_saida_id FROM carga_documento cd WHERE cd.carga_id = p_carga_id AND cd.ativo LOOP
    PERFORM public.fn_onda_concluir_etapa(p_tenant_id, v_onda, 3);
    v_n := v_n + 1;
  END LOOP;

  RETURN jsonb_build_object('sucesso', true, 'codigo', 'CARGA_FECHADA',
    'mensagem', format('Carga #%s fechada; %s onda(s) concluída(s).', v_c.numero_carga, v_n),
    'dados', public._fn_carga_detalhe(p_carga_id));
EXCEPTION WHEN raise_exception THEN RETURN public._fn_carga_erro(SQLERRM);
END $$;

-- ---------- sugestão agrupada pela transportadora do ERP ----------
CREATE OR REPLACE FUNCTION public.carga_sugerir(p_tenant_id uuid, p_empresa_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_crit text; v_ondas jsonb;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);
  SELECT rc.criterio::text INTO v_crit FROM roteiro_saida_criterio rc
   WHERE rc.tenant_id = p_tenant_id AND rc.empresa_id = p_empresa_id AND rc.nivel = 'EMBARQUE'
   ORDER BY rc.sequencia LIMIT 1;

  WITH elegiveis AS (
    SELECT ms.* FROM movimento_saida ms
     WHERE ms.tenant_id = p_tenant_id AND ms.empresa_id = p_empresa_id
       AND ms.status IN ('CONFERIDO','SEPARADO')
       AND NOT EXISTS (SELECT 1 FROM carga_documento cd WHERE cd.movimento_saida_id = ms.id AND cd.ativo)
       AND public._fn_carga_onda_motivo(ms.id) IS NULL
  ), base AS (
    SELECT e.id, e.numero_onda, e.status::text AS status, e.veiculo_id, e.box_id, e.rota_id, e.peso_total, e.m3,
           e.prioridade::text AS prioridade, e.created_at,
           v.descricao AS veiculo, v.placa, b.descricao AS box, r.descricao AS rota, ts.descricao AS tipo_saida,
           public._fn_carga_onda_transportadoras(e.id) AS transps,
           (SELECT count(*) FROM movimento_saida_documento msd WHERE msd.movimento_saida_id = e.id) AS documentos,
           (SELECT count(*) FROM volume_expedicao ve WHERE ve.movimento_saida_id = e.id) AS volumes,
           (SELECT CASE WHEN count(DISTINCT ds.parceiro_id) = 1 THEN min(ds.parceiro_id::text) ELSE 'VARIOS' END
              FROM movimento_saida_documento msd JOIN documento_saida ds ON ds.id = msd.documento_saida_id
             WHERE msd.movimento_saida_id = e.id) AS parceiro_chave,
           (SELECT string_agg(DISTINCT COALESCE(p.nome_fantasia, p.razaosocial), ', ')
              FROM movimento_saida_documento msd JOIN documento_saida ds ON ds.id = msd.documento_saida_id
              LEFT JOIN parceiro p ON p.id = ds.parceiro_id WHERE msd.movimento_saida_id = e.id) AS parceiros
      FROM elegiveis e
      LEFT JOIN veiculos v ON v.id = e.veiculo_id
      LEFT JOIN box b ON b.id = e.box_id
      LEFT JOIN rotas r ON r.id = e.rota_id
      LEFT JOIN tipo_saida ts ON ts.id = e.tipo_saida
  ), comp AS (
    SELECT base.*,
           CASE WHEN array_length(transps, 1) = 1 THEN transps[1] END AS transp_id,
           COALESCE(array_length(transps, 1), 0) AS n_transps,
           public._fn_carga_nome_parceiros(transps) AS transp_nome
      FROM base
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'movimento_saida_id', id, 'numero_onda', numero_onda, 'status', status, 'prioridade', prioridade,
           'veiculo_id', veiculo_id, 'veiculo', veiculo, 'placa', placa, 'box_id', box_id, 'box', box,
           'transportadora_id', transp_id, 'transportadora', transp_nome, 'transportadoras', n_transps,
           'rota', rota, 'tipo_saida', tipo_saida, 'parceiros', parceiros,
           'peso_total', peso_total, 'm3', m3, 'documentos', documentos, 'volumes', volumes, 'created_at', created_at,
           'grupo_chave', concat_ws('|', CASE v_crit WHEN 'ROTA' THEN COALESCE(rota_id::text, 'SEM_ROTA')
                                                     WHEN 'PARCEIRO' THEN parceiro_chave END,
                                    CASE WHEN n_transps > 1 THEN 'VARIAS_TRANSP'
                                         WHEN transp_id IS NOT NULL THEN 'T:' || transp_id
                                         ELSE 'V:' || COALESCE(veiculo_id::text, 'SEM_VEICULO') END,
                                    COALESCE(box_id::text, 'SEM_BOX')),
           'grupo_rotulo', concat_ws(' · ', CASE v_crit WHEN 'ROTA' THEN COALESCE(rota, 'Sem rota')
                                                        WHEN 'PARCEIRO' THEN CASE WHEN parceiro_chave = 'VARIOS' THEN 'Vários parceiros' ELSE parceiros END END,
                                     CASE WHEN n_transps > 1 THEN 'Várias transportadoras (separe por transportadora)'
                                          WHEN transp_id IS NOT NULL THEN 'Transportadora ' || transp_nome
                                          ELSE COALESCE('Veículo ' || veiculo || COALESCE(' (' || placa || ')', ''), 'Sem veículo/transportadora') END,
                                     COALESCE(box, 'Sem box'))
         ) ORDER BY numero_onda), '[]'::jsonb)
    INTO v_ondas FROM comp;

  RETURN jsonb_build_object('sucesso', true, 'codigo', 'CARGA_SUGESTAO',
    'dados', jsonb_build_object('criterio', v_crit, 'ondas', v_ondas));
END $$;

-- ---------- listas (web e coletor) mostram transportadora ----------
CREATE OR REPLACE FUNCTION public.carga_listar(p_tenant_id uuid, p_empresa_id uuid, p_status text[] DEFAULT NULL, p_limite integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v jsonb;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);
  SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'numero_carga')::bigint DESC), '[]'::jsonb) INTO v FROM (
    SELECT jsonb_build_object(
      'id', c.id, 'numero_carga', c.numero_carga, 'status', c.status, 'unidade_embarque', c.unidade_embarque,
      'modalidade', c.modalidade, 'transportadora', COALESCE(tp.nome_fantasia, tp.razaosocial),
      'veiculo', v.descricao, 'placa', COALESCE(c.placa, v.placa), 'box', b.descricao, 'motorista', c.motorista,
      'peso_total', c.peso_total, 'm3_total', c.m3_total,
      'ondas', (SELECT count(DISTINCT cd.movimento_saida_id) FROM carga_documento cd WHERE cd.carga_id = c.id AND cd.ativo),
      'documentos', (SELECT count(*) FROM carga_documento cd WHERE cd.carga_id = c.id AND cd.ativo),
      'unidades_total', (SELECT count(*) FROM carga_unidade cu WHERE cu.carga_id = c.id AND cu.status <> 'CANCELADA'),
      'unidades_embarcadas', (SELECT count(*) FROM carga_unidade cu WHERE cu.carga_id = c.id AND cu.status = 'EMBARCADA'),
      'created_at', c.created_at, 'liberada_em', c.liberada_em, 'fechada_em', c.fechada_em) AS x
      FROM carga c
      LEFT JOIN veiculos v ON v.id = c.veiculo_id
      LEFT JOIN parceiro tp ON tp.id = c.transportadora_id
      LEFT JOIN box b ON b.id = c.box_id
     WHERE c.tenant_id = p_tenant_id AND c.empresa_id = p_empresa_id
       AND (p_status IS NULL OR c.status = ANY(p_status))
     ORDER BY c.numero_carga DESC
     LIMIT LEAST(GREATEST(COALESCE(p_limite, 100), 1), 500)) s;
  RETURN jsonb_build_object('sucesso', true, 'codigo', 'CARGA_LISTA', 'dados', v);
END $$;

CREATE OR REPLACE FUNCTION public.embarque_buscar_cargas(p_tenant_id uuid, p_empresa_id uuid, p_usuario_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v jsonb;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);
  PERFORM public.assert_usuario_sessao(p_usuario_id);
  SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'status') DESC, (x->>'numero_carga')::bigint), '[]'::jsonb) INTO v FROM (
    SELECT jsonb_build_object(
      'id', c.id, 'numero_carga', c.numero_carga, 'status', c.status, 'unidade_embarque', c.unidade_embarque,
      'modalidade', c.modalidade, 'transportadora', COALESCE(tp.nome_fantasia, tp.razaosocial),
      'veiculo', v.descricao, 'placa', COALESCE(c.placa, v.placa), 'box', b.descricao, 'motorista', c.motorista,
      'documentos', (SELECT count(*) FROM carga_documento cd WHERE cd.carga_id = c.id AND cd.ativo),
      'unidades_total', (SELECT count(*) FROM carga_unidade cu WHERE cu.carga_id = c.id AND cu.status <> 'CANCELADA'),
      'unidades_embarcadas', (SELECT count(*) FROM carga_unidade cu WHERE cu.carga_id = c.id AND cu.status = 'EMBARCADA')) AS x
      FROM carga c
      LEFT JOIN veiculos v ON v.id = c.veiculo_id
      LEFT JOIN parceiro tp ON tp.id = c.transportadora_id
      LEFT JOIN box b ON b.id = c.box_id
     WHERE c.tenant_id = p_tenant_id AND c.empresa_id = p_empresa_id AND c.status IN ('LIBERADA','EM_CARREGAMENTO')) s;
  RETURN jsonb_build_object('sucesso', true, 'codigo', 'EMBARQUE_CARGAS', 'dados', v);
END $$;

-- lista de transportadoras para a tela (parceiro eh_transportador ativo)
CREATE OR REPLACE FUNCTION public.carga_transportadoras(p_tenant_id uuid, p_empresa_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);
  RETURN jsonb_build_object('sucesso', true, 'codigo', 'CARGA_TRANSPORTADORAS', 'dados',
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'razaosocial', p.razaosocial, 'nome_fantasia', p.nome_fantasia, 'cnpj', p.cnpj)
                ORDER BY COALESCE(p.nome_fantasia, p.razaosocial))
                FROM parceiro p
               WHERE p.tenant_id = p_tenant_id AND p.eh_transportador AND COALESCE(p.ativo, true)
                 AND (p.empresa_id IS NULL OR p.empresa_id = p_empresa_id)), '[]'::jsonb));
END $$;

-- ---------- grants ----------
REVOKE ALL ON FUNCTION public._fn_carga_doc_transportadora(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_carga_onda_transportadoras(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_carga_nome_parceiros(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_carga_detalhe(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carga_montar(uuid,uuid,uuid,uuid,uuid[],uuid,uuid,text,text,text,uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.carga_montar(uuid,uuid,uuid,uuid,uuid[],uuid,uuid,text,text,text,uuid,text,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.carga_transportadoras(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.carga_transportadoras(uuid,uuid) TO authenticated, service_role;
