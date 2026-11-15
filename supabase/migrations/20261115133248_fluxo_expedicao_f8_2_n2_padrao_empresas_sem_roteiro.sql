-- F8.2 (2026-11-15, produção): empresas sem critério no N2 após o pacote recebem "Movimento por Documento",
-- o mesmo padrão do provisionamento (F8.1). Só empresas sem nenhum critério de MOVIMENTO.
-- Em produção eram 3 empresas sem pedidos nem ondas (sem roteiro legado por empresa).
-- Reversão: apagar as linhas MOVIMENTO/DOCUMENTO dessas empresas pela tela do Fluxo de Expedição.
INSERT INTO public.roteiro_saida_criterio (tenant_id, empresa_id, nivel, criterio, sequencia)
SELECT e.tenant_id, e.id, 'MOVIMENTO', 'DOCUMENTO', 1
  FROM public.empresa e
 WHERE NOT EXISTS (SELECT 1 FROM public.roteiro_saida_criterio rc WHERE rc.empresa_id = e.id AND rc.nivel = 'MOVIMENTO');
