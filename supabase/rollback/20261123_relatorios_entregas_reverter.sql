-- Reverte 20261123160000_relatorios_entregas.sql (só leitura: nenhum dado operacional é tocado).
DROP FUNCTION IF EXISTS public.rpc_relatorio_entregas_tentativas(
  uuid, uuid, date, date, uuid, uuid, uuid, text, uuid, boolean, integer, integer, text);
DROP FUNCTION IF EXISTS public.rpc_relatorio_entregas_motivos(uuid, uuid, date, date, uuid, uuid, uuid, text);

DELETE FROM public.perfil_permissao pp
 USING public.permissao pe, public.modulo m
 WHERE pp.permissao_id = pe.id AND pe.modulo_id = m.id
   AND m.codigo IN ('web.relatorios.entregas', 'web.relatorios.entregas-motivos');
DELETE FROM public.permissao pe USING public.modulo m
 WHERE pe.modulo_id = m.id AND m.codigo IN ('web.relatorios.entregas', 'web.relatorios.entregas-motivos');
DELETE FROM public.modulo WHERE codigo IN ('web.relatorios.entregas', 'web.relatorios.entregas-motivos');
