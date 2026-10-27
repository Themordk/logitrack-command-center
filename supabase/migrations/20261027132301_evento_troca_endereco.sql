-- 2026-10-27: suporte a eventos de tarefa antes da execução (ex.: troca de endereço no coletor).
ALTER TYPE public.enum_tipo_evento_execucao ADD VALUE IF NOT EXISTS 'TROCA_ENDERECO';

-- Troca de endereço ocorre antes de existir tarefa_execucao; vínculo pela coluna tarefa_id.
ALTER TABLE public.tarefa_evento_execucao ALTER COLUMN execucao_tarefa_id DROP NOT NULL;

ALTER TABLE public.tarefa_evento_execucao
  ADD CONSTRAINT tarefa_evento_execucao_vinculo_chk
  CHECK (execucao_tarefa_id IS NOT NULL OR tarefa_id IS NOT NULL) NOT VALID;
ALTER TABLE public.tarefa_evento_execucao VALIDATE CONSTRAINT tarefa_evento_execucao_vinculo_chk;

CREATE INDEX IF NOT EXISTS idx_tarefa_evento_execucao_tarefa_id
  ON public.tarefa_evento_execucao (tenant_id, tarefa_id);
