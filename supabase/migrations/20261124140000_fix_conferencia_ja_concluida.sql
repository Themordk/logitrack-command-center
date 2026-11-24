-- Fix 24/11/2026 — fn_gerar_conferencia_saida (v7): onda presa em SEPARADO.
-- Cenário: onda já conferida → limpeza da separação de um item (cancela só a SEP-CONF dele) →
-- corte total desse item. A onda volta a SEPARADO, nenhuma SEP-CONF nova é criada (item cortado
-- tem qtd 0 e os demais já têm conferência concluída) e a função devolvia JA_EXISTE sem encerrar
-- a etapa. Agora: sem tarefa aberta na onda e com conferência concluída, encerra a etapa 2 pela
-- regra única (fn_onda_concluir_etapa → CONFERIDO → CONCLUIDA se for a última etapa).
DO $mig$
DECLARE
  v_def   text;
  v_novo  text;
  v_anc   text := $a$    RETURN jsonb_build_object('sucesso', true, 'codigo', 'JA_EXISTE',$a$;
BEGIN
  v_def := pg_get_functiondef('public.fn_gerar_conferencia_saida(uuid,uuid)'::regprocedure);
  IF position('CONFERENCIA_JA_CONCLUIDA' in v_def) > 0 THEN
    RETURN;
  END IF;
  IF (length(v_def) - length(replace(v_def, v_anc, ''))) / length(v_anc) <> 1 THEN
    RAISE EXCEPTION 'fix conferência: âncora JA_EXISTE não encontrada (ou repetida)';
  END IF;

  v_novo := replace(v_def, v_anc, $b$    -- v7 (2026-11-24): nada novo a conferir e nenhuma tarefa aberta, com conferência já concluída
    -- (ex.: item que voltou para separação terminou em corte total) → encerra a etapa de conferência.
    IF NOT EXISTS (SELECT 1 FROM tarefa tc JOIN movimento_saida_item mi ON mi.id = tc.id_documento_origem
                    WHERE mi.movimento_saida_id = p_movimento_saida_id AND tc.tenant_id = p_tenant_id
                      AND tc.status NOT IN ('CONCLUIDA'::enum_status_tarefa, 'CANCELADA'::enum_status_tarefa))
       AND EXISTS (SELECT 1 FROM tarefa tc JOIN movimento_saida_item mi ON mi.id = tc.id_documento_origem
                    WHERE mi.movimento_saida_id = p_movimento_saida_id AND tc.tenant_id = p_tenant_id
                      AND tc.tipo_tarefa_id = v_tipo_tarefa_id
                      AND tc.status = 'CONCLUIDA'::enum_status_tarefa)
    THEN
      v_fim := public.fn_onda_concluir_etapa(p_tenant_id, p_movimento_saida_id, 2);
      RETURN jsonb_build_object('sucesso', true, 'codigo', 'CONFERENCIA_JA_CONCLUIDA',
        'mensagem', 'Nada novo a conferir e a conferência da onda já estava concluída; etapa encerrada.',
        'dados', v_fim);
    END IF;
$b$ || v_anc);
  v_novo := replace(v_novo, '-- v6 (2026-11-12) F5.2', '-- v7 (2026-11-24): encerra a conferência quando não há nada novo a conferir e nada aberto.
-- v6 (2026-11-12) F5.2');
  EXECUTE v_novo;
END
$mig$;
