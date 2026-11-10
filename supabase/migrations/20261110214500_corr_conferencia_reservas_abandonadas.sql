-- =====================================================================
-- 2026-11-10 · Correção pontual de dados · reservas de conferência abandonadas
--
-- Após 20261110202246 (regra de reserva corrigida) havia, em produção,
-- 30 ondas SEPARADO/EM_CONFERENCIA (42 atribuições SEP-CONF) presas a um
-- operador sem atividade há mais de 24h (mais antiga 25/09/2026).
-- Aprovado pelo responsável do produto em 10/11/2026: liberar essas reservas.
--
-- Usa a mesma rotina do coletor (fn_conferencia_liberar_reservas_expiradas,
-- de 20261110213000) com limite fixo de 1440 min:
--   - tarefa_atribuicao: ATRIBUIDA -> LIBERADA, liberado_em, observacao
--     ('Reserva de conferência expirada (CORRECAO_20261110) ...');
--   - tarefa SEP-CONF sem atribuição ativa: -> CRIADA (quantidade_executada
--     mantida; o próximo operador confere só o saldo).
-- Rastreio: tarefa_atribuicao.observacao ILIKE '%CORRECAO_20261110%'.
-- Idempotente: reexecutar não encontra mais reservas expiradas.
-- =====================================================================
DO $$
DECLARE
  r        record;
  v_qtd    integer;
  v_ondas  integer := 0;
  v_total  integer := 0;
BEGIN
  FOR r IN
    SELECT ms.tenant_id, ms.id
    FROM movimento_saida ms
    WHERE ms.status IN ('SEPARADO', 'EM_CONFERENCIA')
    ORDER BY ms.tenant_id, ms.numero_onda
  LOOP
    v_qtd := public.fn_conferencia_liberar_reservas_expiradas(r.tenant_id, r.id, NULL, 1440, 'CORRECAO_20261110');
    IF v_qtd > 0 THEN
      v_ondas := v_ondas + 1;
      v_total := v_total + v_qtd;
    END IF;
  END LOOP;

  RAISE NOTICE 'CORRECAO_20261110: % onda(s), % atribuição(ões) liberada(s).', v_ondas, v_total;
END $$;
