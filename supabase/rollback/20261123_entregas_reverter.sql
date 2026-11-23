-- =============================================================================
-- REVERSÃO — Módulo de Entregas (migrations 20261123120000 e 20261123120100)
-- NÃO é migration automática: rodar manualmente, só com aprovação, e SÓ depois de
-- voltar o front-end para a versão anterior (o front novo chama as RPCs removidas).
--
-- ATENÇÃO: apaga as entregas, paradas e eventos registrados (fotos no bucket
-- 'evidencias' ficam; as ocorrências de etapa ENTREGA ficam em
-- ocorrencia_operacional). Exporte antes se houver uso real.
--
-- O que volta:  fn_coletor_menu_badges sem a chave 'entregas';
--               fn_seed_rbac_para_tenant a partir do backup _bkp_entregas.
-- O que sai:    tabelas entrega*, RPCs entrega_*, gatilhos de carga e veículo,
--               veiculos.usuario_id, motivo_ocorrencia.impede_entrega,
--               módulo coletor.entregas e permissões.
-- O que fica:   o valor ENTREGA de enum_etapa_ocorrencia (Postgres não remove
--               valor de enum) e os motivos de etapa ENTREGA criados (inativar
--               à mão se quiser).
-- =============================================================================
BEGIN;

DROP TRIGGER IF EXISTS trg_carga_entrega_gerar ON public.carga;
DROP TRIGGER IF EXISTS trg_veiculo_entregador_validar ON public.veiculos;

DROP FUNCTION IF EXISTS public.entrega_minhas_listar(uuid,uuid);
DROP FUNCTION IF EXISTS public.entrega_detalhe(uuid,uuid,uuid);
DROP FUNCTION IF EXISTS public.entrega_aceitar(uuid,uuid,uuid,numeric,numeric);
DROP FUNCTION IF EXISTS public.entrega_parada_confirmar(uuid,uuid,uuid,text,text,numeric,numeric,numeric);
DROP FUNCTION IF EXISTS public.entrega_motivos_listar(uuid,uuid);
DROP FUNCTION IF EXISTS public.entrega_parada_ocorrencia(uuid,uuid,uuid,uuid,text,text,numeric,numeric,numeric);
DROP FUNCTION IF EXISTS public.entrega_entregadores_listar(uuid);
DROP FUNCTION IF EXISTS public.entrega_carga_detalhe(uuid,uuid,uuid);
DROP FUNCTION IF EXISTS public.entrega_gerar_manual(uuid,uuid,uuid);
DROP FUNCTION IF EXISTS public.entrega_reatribuir(uuid,uuid,uuid,uuid,text);
DROP FUNCTION IF EXISTS public.entrega_cancelar(uuid,uuid,uuid,text);
DROP FUNCTION IF EXISTS public.entrega_parada_estornar(uuid,uuid,uuid,text);
DROP FUNCTION IF EXISTS public._fn_trg_carga_entrega();
DROP FUNCTION IF EXISTS public._fn_veiculo_entregador_validar();
DROP FUNCTION IF EXISTS public._fn_entrega_parada_para_acao(uuid,uuid,uuid);
DROP FUNCTION IF EXISTS public._fn_entrega_foto_valida(uuid,uuid,uuid,text);
DROP FUNCTION IF EXISTS public._fn_entrega_json(uuid);
DROP FUNCTION IF EXISTS public._fn_entrega_gerar(uuid,uuid);
DROP FUNCTION IF EXISTS public._fn_entrega_recalcular(uuid,uuid);
DROP FUNCTION IF EXISTS public._fn_entrega_evento(uuid,uuid,text,uuid,numeric,numeric,jsonb);
DROP FUNCTION IF EXISTS public._fn_entrega_autorizar(uuid,uuid,text);
DROP FUNCTION IF EXISTS public._fn_entrega_usuario_elegivel(uuid,uuid);
DROP FUNCTION IF EXISTS public._fn_entrega_seed_motivos(uuid);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'entrega') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.entrega';
  END IF;
END $$;

ALTER TABLE public.entrega_parada DROP CONSTRAINT IF EXISTS entrega_parada_ultima_ocorrencia_id_fkey;
DROP TABLE IF EXISTS public.entrega_evento;
DROP TABLE IF EXISTS public.entrega_parada;
DROP TABLE IF EXISTS public.entrega;
DROP FUNCTION IF EXISTS public._fn_entrega_evento_imutavel();

ALTER TABLE public.veiculos DROP COLUMN IF EXISTS usuario_id;
ALTER TABLE public.motivo_ocorrencia DROP COLUMN IF EXISTS impede_entrega;

-- badges sem a chave 'entregas' (versão F6)
CREATE OR REPLACE FUNCTION public.fn_coletor_menu_badges(p_tenant_id uuid, p_empresa_id uuid, p_armazem_id uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id); -- seguranca 2026-10-12 L2
  RETURN public.fn_coletor_menu_badges__sem_checagem(p_tenant_id, p_empresa_id, p_armazem_id)
      || jsonb_build_object('embarque', (SELECT count(*) FROM carga c
            WHERE c.tenant_id = p_tenant_id AND c.empresa_id = p_empresa_id AND c.status IN ('LIBERADA','EM_CARREGAMENTO'))); -- F6 2026-11-12
END;$function$;

-- seed RBAC: volta a versão anterior a esta migration
DO $$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef('public.fn_seed_rbac_para_tenant_bkp_entregas(uuid)'::regprocedure);
  EXECUTE replace(v_def, 'FUNCTION public.fn_seed_rbac_para_tenant_bkp_entregas(', 'FUNCTION public.fn_seed_rbac_para_tenant(');
END $$;
DROP FUNCTION IF EXISTS public.fn_seed_rbac_para_tenant_bkp_entregas(uuid);

DELETE FROM perfil_permissao pp USING permissao p, modulo m
 WHERE pp.permissao_id = p.id AND p.modulo_id = m.id AND m.codigo = 'coletor.entregas';
DELETE FROM permissao p USING modulo m WHERE p.modulo_id = m.id AND m.codigo = 'coletor.entregas';
DELETE FROM modulo WHERE codigo = 'coletor.entregas';

COMMIT;
