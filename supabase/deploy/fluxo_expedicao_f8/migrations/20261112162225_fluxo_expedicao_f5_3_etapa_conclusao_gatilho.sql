-- =====================================================================
-- Fluxo de Expedição — F5.3 · 2026-11-12
-- etapa_conclusao deixa de ser coluna GERADA: a tela de Tipos de Saída reenvia todas as
-- colunas ao salvar e o PostgreSQL recusa gravação em coluna gerada (a edição quebrava).
-- Passa a ser coluna comum mantida por gatilho; o valor enviado é sempre substituído.
-- Reversão: DROP TRIGGER trg_tipo_saida_etapa_conclusao + DROP FUNCTION + DROP COLUMN etapa_conclusao.
-- =====================================================================
ALTER TABLE public.tipo_saida DROP COLUMN IF EXISTS etapa_conclusao;
ALTER TABLE public.tipo_saida ADD COLUMN etapa_conclusao text;

CREATE OR REPLACE FUNCTION public.tg_tipo_saida_etapa_conclusao()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  NEW.etapa_conclusao := CASE WHEN COALESCE(NEW.realiza_embarque, false) THEN 'EMBARQUE'
                              WHEN COALESCE(NEW.realiza_conferencia, false) THEN 'CONFERENCIA'
                              ELSE 'SEPARACAO' END;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tg_tipo_saida_etapa_conclusao() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_tipo_saida_etapa_conclusao ON public.tipo_saida;
CREATE TRIGGER trg_tipo_saida_etapa_conclusao BEFORE INSERT OR UPDATE ON public.tipo_saida
  FOR EACH ROW EXECUTE FUNCTION public.tg_tipo_saida_etapa_conclusao();

UPDATE public.tipo_saida SET etapa_conclusao = NULL;  -- o gatilho recalcula
ALTER TABLE public.tipo_saida ALTER COLUMN etapa_conclusao SET NOT NULL;
COMMENT ON COLUMN public.tipo_saida.etapa_conclusao IS
  'Somente leitura (mantida por gatilho): etapa em que a onda fica CONCLUIDA (última etapa ligada).';
