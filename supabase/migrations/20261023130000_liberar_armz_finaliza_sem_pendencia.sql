-- =============================================================================
-- Complemento de 20261023120000_conferencia_armazenagem_simultanea.sql
-- -----------------------------------------------------------------------------
-- Com conferência e armazenagem simultâneas, o supervisor pode aceitar uma
-- divergência (ex.: falta total, qtd 0) DEPOIS que todo o resto já foi
-- armazenado. Nesse caso nenhuma tarefa ENTR-ARMZ é criada (qtd 0) e nenhuma
-- chamada futura de finalizar_armazenagem vai acontecer: o movimento ficava
-- parado em LIB_ARMAZENAGEM, fora das duas listas do coletor, e nunca
-- disparava o retorno ao ERP (ARMAZENADO).
--
-- Ajuste: se não há item pendente nem tarefa de armazenagem aberta, o
-- movimento é finalizado como ARMAZENADO.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_liberar_armz_finalizar_manual(p_movimento_entrada_id uuid, p_tenant_id uuid, p_usuario_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pendentes      integer;
  v_armz_abertas   boolean;
  v_status         text;
BEGIN
  SELECT COUNT(*) FILTER (
           WHERE status_item_movimento IN ('PENDENTE','EM_ANDAMENTO','DIVERGENTE'))
    INTO v_pendentes
  FROM movimento_entrada_item
  WHERE movimento_entrada_id = p_movimento_entrada_id
    AND tenant_id = p_tenant_id;

  -- v-conf-armz-simultanea (2026-10-23): ainda há armazenagem por fazer?
  SELECT EXISTS (
    SELECT 1
    FROM tarefa t
    JOIN tipo_tarefa tt             ON tt.id  = t.tipo_tarefa_id
    JOIN movimento_entrada_item mei ON mei.id = t.id_documento_origem
    WHERE mei.movimento_entrada_id = p_movimento_entrada_id
      AND t.tenant_id              = p_tenant_id
      AND tt.codigo                = 'ENTR-ARMZ'
      AND t.status IN ('CRIADA','ATRIBUIDA','EM_ANDAMENTO','PAUSADA')
  ) INTO v_armz_abertas;

  v_status := CASE
                WHEN v_pendentes > 0      THEN 'ARMAZENAGEM_PARCIAL'
                WHEN v_armz_abertas       THEN 'LIB_ARMAZENAGEM'
                ELSE                           'ARMAZENADO'
              END;

  UPDATE movimento_entrada
  SET status            = v_status::enum_status_mov_entrada,
      usuario_autorizou = p_usuario_id,
      autorizado_em     = now(),
      finalizado_em     = CASE WHEN v_status = 'ARMAZENADO' THEN now() ELSE finalizado_em END
  WHERE id = p_movimento_entrada_id
    AND tenant_id = p_tenant_id;

  RETURN v_status;
END;
$function$;
