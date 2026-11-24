-- =====================================================================
-- Status S2 · 4/5 — "Exportada ERP" deixa de ser status físico · 2026-11-23
-- (decisão 5 do plano, aprovada em 15/11 e confirmada em 23/11)
--
-- 1) "Marcar como exportado" (nó Atualizar documento) não muda mais movimento_saida.status
--    para EXPORTADA_ERP nem movimento_entrada.status para EXPORTADO. O fato fica no status de
--    integração (S1: documento.integracao_* e movimento.integracao_resumo). O histórico NÃO é
--    convertido (trocar EXPORTADA_ERP por CONCLUIDA dispararia de novo os retornos ao ERP).
--    integracao_marcar_exportado (motor legado fila_retorno/sync-retorno, sem uso desde 09/2026)
--    fica como está.
-- 2) Painel de TV: ondas EXPORTADA_ERP continuam no dia e contam como expedidas (antes sumiam
--    quando o ERP respondia).
-- 3) Cancelamento de NF de entrada: recebimento ARMAZENADO cuja NF foi integrada na armazenagem
--    (S1) segue o cenário "já exportado", como fazia quando o status virava EXPORTADO.
-- =====================================================================

-- 1) Resumo de integração sem mudança de status físico (p_exportar mantido por compatibilidade)
CREATE OR REPLACE FUNCTION integracao._fn_movimento_integracao_resumo(p_tabela text, p_movimento_id uuid, p_exportar boolean DEFAULT false)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'integracao'
AS $function$
DECLARE
  c_ordem constant text[] := ARRAY['nao_integra', 'ignorado', 'integrado', 'pendente', 'erro'];
  v_pos   int;
  v_res   text;
BEGIN
  -- S2 (23/11): p_exportar não muda mais o status da onda/recebimento; a integração mostra o fato.
  IF p_tabela = 'movimento_saida' THEN
    SELECT max(array_position(c_ordem, d.integracao_estado)) INTO v_pos
      FROM movimento_saida_documento msd
      JOIN documento_saida d ON d.id = msd.documento_saida_id
     WHERE msd.movimento_saida_id = p_movimento_id
       AND d.status NOT IN (9, 99);
    v_res := coalesce(c_ordem[v_pos], 'nao_integra');
    UPDATE movimento_saida SET integracao_resumo = v_res
     WHERE id = p_movimento_id AND integracao_resumo IS DISTINCT FROM v_res;

  ELSIF p_tabela = 'movimento_entrada' THEN
    SELECT max(array_position(c_ordem, d.integracao_estado)) INTO v_pos
      FROM movimento_entrada_documento med
      JOIN documento_entrada d ON d.id = med.documento_entrada_id
     WHERE med.movimento_entrada_id = p_movimento_id
       AND d.status NOT IN (8, 9, 99);
    v_res := coalesce(c_ordem[v_pos], 'nao_integra');
    UPDATE movimento_entrada SET integracao_resumo = v_res
     WHERE id = p_movimento_id AND integracao_resumo IS DISTINCT FROM v_res;
  END IF;
  RETURN v_res;
END;
$function$;

REVOKE ALL ON FUNCTION integracao._fn_movimento_integracao_resumo(text, uuid, boolean) FROM PUBLIC, anon, authenticated;

-- 2) Painel de TV
DO $tv$
DECLARE
  v_sig constant text := 'public.rpc_painel_tv_operacional(text)';
  v_def text := pg_get_functiondef(v_sig::regprocedure);
  a1 constant text := $t$AND ms.status NOT IN ('CANCELADA', 'EXPORTADA_ERP')$t$;
  b1 constant text := $t$AND ms.status <> 'CANCELADA'$t$;
  a2 constant text := $t$'expedidos_hoje',         COUNT(*) FILTER (WHERE status = 'CONCLUIDA')$t$;
  b2 constant text := $t$'expedidos_hoje',         COUNT(*) FILTER (WHERE status IN ('CONCLUIDA', 'EXPORTADA_ERP'))$t$;
BEGIN
  IF position(b2 in v_def) > 0 THEN RETURN; END IF;
  IF position(a1 in v_def) = 0 OR position(a2 in v_def) = 0 THEN
    RAISE EXCEPTION 'Trecho esperado não encontrado em rpc_painel_tv_operacional';
  END IF;
  EXECUTE replace(replace(v_def, a1, b1), a2, b2);
END
$tv$;

-- 3) Cancelamento de NF de entrada
DO $canc$
DECLARE
  v_sig constant text := 'public.fn_cancelar_documento_entrada(uuid,uuid,uuid,text,text,text)';
  v_def text := pg_get_functiondef(v_sig::regprocedure);
  v_int constant text := $t$(v_me.status = 'ARMAZENADO' AND EXISTS (SELECT 1 FROM documento_entrada x WHERE x.id = v_doc.id AND x.integracao_estado = 'integrado' AND x.integracao_evento = 'entrada.armazenagem_finalizada'))$t$;
  a1 constant text := $t$IF v_me.status IN ('ARMAZENADO', 'ARMAZENAGEM_PARCIAL') THEN$t$;
  a2 constant text := $t$IF v_me.status = 'EXPORTADO' THEN$t$;
BEGIN
  IF position('entrada.armazenagem_finalizada' in v_def) > 0 THEN RETURN; END IF;
  IF position(a1 in v_def) = 0 OR position(a2 in v_def) = 0 THEN
    RAISE EXCEPTION 'Trecho esperado não encontrado em fn_cancelar_documento_entrada';
  END IF;
  v_def := replace(v_def, a1, $t$IF v_me.status IN ('ARMAZENADO', 'ARMAZENAGEM_PARCIAL') AND NOT $t$ || v_int || ' THEN');
  v_def := replace(v_def, a2, $t$IF v_me.status = 'EXPORTADO' OR $t$ || v_int || ' THEN');
  EXECUTE v_def;
END
$canc$;
