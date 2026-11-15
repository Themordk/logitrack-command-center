-- Status S1 · 1/4 — Colunas do status de integração (só acréscimos; nada existente muda)
--
-- documento_saida / documento_entrada:
--   integracao_estado       nao_integra | pendente | integrado | erro | ignorado
--   integracao_evento       evento do retorno que definiu o estado (ex.: saida.expedido)
--   integracao_em           quando esse retorno terminou (ou foi criado, se pendente)
--   integracao_erro         mensagem quando o estado é erro
--   integracao_execucao_id  execução de referência (integracao.retorno_execucao)
--   integracao_erros_outros outras regras cujo último retorno deu erro (aviso "retorno anterior com erro")
-- movimento_saida / movimento_entrada:
--   integracao_resumo       pior caso dos documentos (erro > pendente > integrado > ignorado > nao_integra)
-- integracao.retorno_execucao:
--   integracao_resultado    resultado declarado pelo nó "Atualizar documento" (integrado | ignorado | erro | nao_alterar)
--   integracao_mensagem     mensagem do nó (erro de negócio)
--   marcar_exportado        o nó pediu "marcar como exportado" (aplicado na conclusão, com a onda completa)
--
-- status_integracao continua existindo como "marcador" livre da regra (a API devolve esse campo).

ALTER TABLE public.documento_saida
  ADD COLUMN IF NOT EXISTS integracao_estado text NOT NULL DEFAULT 'nao_integra',
  ADD COLUMN IF NOT EXISTS integracao_evento text,
  ADD COLUMN IF NOT EXISTS integracao_em timestamptz,
  ADD COLUMN IF NOT EXISTS integracao_erro text,
  ADD COLUMN IF NOT EXISTS integracao_execucao_id uuid,
  ADD COLUMN IF NOT EXISTS integracao_erros_outros integer NOT NULL DEFAULT 0;

ALTER TABLE public.documento_entrada
  ADD COLUMN IF NOT EXISTS integracao_estado text NOT NULL DEFAULT 'nao_integra',
  ADD COLUMN IF NOT EXISTS integracao_evento text,
  ADD COLUMN IF NOT EXISTS integracao_em timestamptz,
  ADD COLUMN IF NOT EXISTS integracao_erro text,
  ADD COLUMN IF NOT EXISTS integracao_execucao_id uuid,
  ADD COLUMN IF NOT EXISTS integracao_erros_outros integer NOT NULL DEFAULT 0;

ALTER TABLE public.movimento_saida
  ADD COLUMN IF NOT EXISTS integracao_resumo text NOT NULL DEFAULT 'nao_integra';

ALTER TABLE public.movimento_entrada
  ADD COLUMN IF NOT EXISTS integracao_resumo text NOT NULL DEFAULT 'nao_integra';

ALTER TABLE integracao.retorno_execucao
  ADD COLUMN IF NOT EXISTS integracao_resultado text,
  ADD COLUMN IF NOT EXISTS integracao_mensagem text,
  ADD COLUMN IF NOT EXISTS marcar_exportado boolean NOT NULL DEFAULT false;

ALTER TABLE public.documento_saida DROP CONSTRAINT IF EXISTS documento_saida_integracao_estado_chk;
ALTER TABLE public.documento_saida ADD CONSTRAINT documento_saida_integracao_estado_chk
  CHECK (integracao_estado IN ('nao_integra', 'pendente', 'integrado', 'erro', 'ignorado'));
ALTER TABLE public.documento_entrada DROP CONSTRAINT IF EXISTS documento_entrada_integracao_estado_chk;
ALTER TABLE public.documento_entrada ADD CONSTRAINT documento_entrada_integracao_estado_chk
  CHECK (integracao_estado IN ('nao_integra', 'pendente', 'integrado', 'erro', 'ignorado'));
ALTER TABLE public.movimento_saida DROP CONSTRAINT IF EXISTS movimento_saida_integracao_resumo_chk;
ALTER TABLE public.movimento_saida ADD CONSTRAINT movimento_saida_integracao_resumo_chk
  CHECK (integracao_resumo IN ('nao_integra', 'pendente', 'integrado', 'erro', 'ignorado'));
ALTER TABLE public.movimento_entrada DROP CONSTRAINT IF EXISTS movimento_entrada_integracao_resumo_chk;
ALTER TABLE public.movimento_entrada ADD CONSTRAINT movimento_entrada_integracao_resumo_chk
  CHECK (integracao_resumo IN ('nao_integra', 'pendente', 'integrado', 'erro', 'ignorado'));
ALTER TABLE integracao.retorno_execucao DROP CONSTRAINT IF EXISTS retorno_execucao_integracao_resultado_chk;
ALTER TABLE integracao.retorno_execucao ADD CONSTRAINT retorno_execucao_integracao_resultado_chk
  CHECK (integracao_resultado IS NULL OR integracao_resultado IN ('integrado', 'ignorado', 'erro', 'nao_alterar'));

-- Filtros de lista (selo "ERP" das ondas e recebimentos)
CREATE INDEX IF NOT EXISTS idx_movimento_saida_integracao_resumo
  ON public.movimento_saida (tenant_id, integracao_resumo) WHERE integracao_resumo IN ('erro', 'pendente');
CREATE INDEX IF NOT EXISTS idx_movimento_entrada_integracao_resumo
  ON public.movimento_entrada (tenant_id, integracao_resumo) WHERE integracao_resumo IN ('erro', 'pendente');

COMMENT ON COLUMN public.documento_saida.integracao_estado IS 'S1: estado da integração com o ERP, calculado pelo motor de retorno (integracao._fn_documento_integracao_recalcular). Não gravar pela aplicação.';
COMMENT ON COLUMN public.documento_entrada.integracao_estado IS 'S1: estado da integração com o ERP, calculado pelo motor de retorno (integracao._fn_documento_integracao_recalcular). Não gravar pela aplicação.';
COMMENT ON COLUMN public.documento_saida.status_integracao IS 'Marcador livre gravado pelo nó "Atualizar documento" da regra de retorno (padrão "retornado"). O estado real está em integracao_estado.';
COMMENT ON COLUMN public.documento_entrada.status_integracao IS 'Marcador livre gravado pelo nó "Atualizar documento" da regra de retorno. "GERADO_WMS" marca entrada gerada pelo WMS (não dispara retorno). O estado real está em integracao_estado.';
COMMENT ON COLUMN public.movimento_saida.integracao_resumo IS 'S1: pior estado de integração dos documentos da onda.';
COMMENT ON COLUMN public.movimento_entrada.integracao_resumo IS 'S1: pior estado de integração dos documentos do recebimento.';
