-- Reverte 20261123190000_retorno_eventos_embarque_entrega.sql.
-- Antes: arquive os fluxos que usam os eventos novos (o catálogo é desativado, não apagado, para não quebrar o histórico).
DROP TRIGGER IF EXISTS trg_zz_retorno_carga ON public.carga;
DROP TRIGGER IF EXISTS trg_zz_retorno_carga_documento ON public.carga_documento;
DROP TRIGGER IF EXISTS trg_zz_retorno_carga_documento_embarcado ON public.carga_documento;
DROP TRIGGER IF EXISTS trg_zz_retorno_entrega_aceite ON public.entrega;
DROP TRIGGER IF EXISTS trg_zz_retorno_entrega_tentativa_ins ON public.entrega_tentativa;
DROP TRIGGER IF EXISTS trg_zz_retorno_entrega_tentativa_est ON public.entrega_tentativa;
UPDATE integracao.retorno_evento_catalogo SET ativo = false
 WHERE codigo IN ('saida.carga_montada','saida.pedido_embarcado','saida.carga_fechada','saida.retirado_da_carga',
                  'saida.saiu_para_entrega','saida.entregue','saida.nao_entregue','saida.entrega_estornada');
-- O contexto com os blocos carga/entrega é aditivo e pode ficar; para remover, reaplique fn_retorno_contexto anterior.
