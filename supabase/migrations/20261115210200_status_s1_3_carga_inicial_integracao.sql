-- Status S1 · 3/4 — Carga inicial do status de integração a partir do histórico de retornos
--
-- Só documentos com alguma execução real (sem teste/simulação); os demais ficam em nao_integra (padrão).
-- trg_tocar_updated_at é desligado só durante a carga para não marcar milhares de documentos como
-- "alterados agora" (updated_at). Nada mais muda: o marcador status_integracao fica como está.
-- O movimento NÃO é exportado aqui (p_exportar = false): a carga só lê o histórico.

ALTER TABLE public.documento_saida   DISABLE TRIGGER trg_tocar_updated_at;
ALTER TABLE public.documento_entrada DISABLE TRIGGER trg_tocar_updated_at;

DO $carga$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT x.entidade, x.documento_id
      FROM integracao.retorno_execucao x
     WHERE x.documento_id IS NOT NULL
       AND x.entidade IN ('documento_saida', 'documento_entrada')
       AND x.modo NOT IN ('teste', 'simulacao', 'lote')
  LOOP
    PERFORM integracao._fn_documento_integracao_recalcular(r.entidade, r.documento_id, false);
  END LOOP;
END
$carga$;

ALTER TABLE public.documento_saida   ENABLE TRIGGER trg_tocar_updated_at;
ALTER TABLE public.documento_entrada ENABLE TRIGGER trg_tocar_updated_at;
