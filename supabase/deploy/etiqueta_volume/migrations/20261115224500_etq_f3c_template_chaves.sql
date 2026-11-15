-- Migration: 20261115224500_etq_f3c_template_chaves.sql
-- Plano: Etiqueta de Volume de Expedição — Fase 3 (correção B16)
-- Defeito: templates de VOLUME com variável escrita errado saem com o campo vazio:
--          {{trasportadora}} (o servidor envia transportadora) e {{total_volume}} (o servidor envia total_volumes).
--          Produção: 4 templates ativos com cada um dos erros.
-- Ação: corrige o texto dos templates (ZPL, EPL e TSPL). Só troca essas duas variáveis.
-- Risco: baixo — muda só o texto da variável; o leiaute do template fica igual.
-- Rollback: os textos anteriores ficam em ops.rollback_definicao (um UPDATE por template).

INSERT INTO ops.rollback_definicao (migration, objeto, definicao)
SELECT '20261115224500_etq_f3c_template_chaves', 'data etiqueta_template ' || t.id,
       format('UPDATE public.etiqueta_template SET corpo_zpl = %L, corpo_epl = %L, corpo_tspl = %L WHERE id = %L;',
              t.corpo_zpl, t.corpo_epl, t.corpo_tspl, t.id)
  FROM public.etiqueta_template t
 WHERE t.tipo = 'VOLUME'
   AND coalesce(t.corpo_zpl, '') || coalesce(t.corpo_epl, '') || coalesce(t.corpo_tspl, '') ~ '\{\{\s*(trasportadora|total_volume)\s*\}\}'
   AND NOT EXISTS (SELECT 1 FROM ops.rollback_definicao r
                    WHERE r.migration = '20261115224500_etq_f3c_template_chaves' AND r.objeto = 'data etiqueta_template ' || t.id);

UPDATE public.etiqueta_template t
   SET corpo_zpl  = regexp_replace(regexp_replace(t.corpo_zpl,  '\{\{\s*trasportadora\s*\}\}', '{{transportadora}}', 'g'), '\{\{\s*total_volume\s*\}\}', '{{total_volumes}}', 'g'),
       corpo_epl  = regexp_replace(regexp_replace(t.corpo_epl,  '\{\{\s*trasportadora\s*\}\}', '{{transportadora}}', 'g'), '\{\{\s*total_volume\s*\}\}', '{{total_volumes}}', 'g'),
       corpo_tspl = regexp_replace(regexp_replace(t.corpo_tspl, '\{\{\s*trasportadora\s*\}\}', '{{transportadora}}', 'g'), '\{\{\s*total_volume\s*\}\}', '{{total_volumes}}', 'g')
 WHERE t.tipo = 'VOLUME'
   AND coalesce(t.corpo_zpl, '') || coalesce(t.corpo_epl, '') || coalesce(t.corpo_tspl, '') ~ '\{\{\s*(trasportadora|total_volume)\s*\}\}';

-- ROLLBACK (manual):
--   SELECT definicao FROM ops.rollback_definicao WHERE migration = '20261115224500_etq_f3c_template_chaves';
--   e executar cada UPDATE.
