-- =====================================================================
-- Módulo de Entregas · ajustes de 23/11 — NF, observação do pedido e telefone
-- ---------------------------------------------------------------------
-- A parada passa a mostrar, lidos na hora (não só na geração da entrega):
--   * numero_nf / serie_nf: última NF não cancelada em documento_saida_nf
--     (a NF costuma ser emitida depois da conferência, após a entrega existir);
--     sem NF, fica o que foi copiado na geração.
--   * observacao_pedido: documento_saida.observacao (vem do ERP, escrita pelo vendedor).
--   * telefone / contato: os do cadastro do parceiro hoje; sem valor, os copiados.
-- O endereço continua sendo a cópia da geração (registro de para onde foi).
-- Reversão: reaplicar _fn_entrega_json de 20261123120100_entregas_e1_e3_estrutura_rpcs.sql.
-- =====================================================================
CREATE OR REPLACE FUNCTION public._fn_entrega_json(p_entrega_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'id', e.id, 'carga_id', e.carga_id, 'numero_carga', c.numero_carga, 'status', e.status,
    'usuario_id', e.usuario_id, 'usuario_nome', u.nome,
    'veiculo_id', e.veiculo_id, 'veiculo', v.descricao, 'placa', v.placa, 'tipo_veiculo', v.tipo_veiculo,
    'atribuida_em', e.atribuida_em, 'aceita_em', e.aceita_em, 'concluida_em', e.concluida_em,
    'cancelada_em', e.cancelada_em, 'motivo_cancelamento', e.motivo_cancelamento,
    'carga_fechada_em', c.fechada_em,
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
        LEFT JOIN ocorrencia_operacional o ON o.id = p.ultima_ocorrencia_id
        LEFT JOIN motivo_ocorrencia mo ON mo.id = o.motivo_ocorrencia_id
       WHERE p.entrega_id = e.id), '[]'::jsonb))
    FROM entrega e
    JOIN carga c ON c.id = e.carga_id
    LEFT JOIN usuario u ON u.id = e.usuario_id
    LEFT JOIN veiculos v ON v.id = e.veiculo_id
   WHERE e.id = p_entrega_id;
$$;
REVOKE ALL ON FUNCTION public._fn_entrega_json(uuid) FROM PUBLIC, anon, authenticated;
