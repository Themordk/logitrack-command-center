DROP FUNCTION IF EXISTS public.fn_criar_inventario_v2(uuid, uuid, uuid, uuid, text, public.enum_tipo_inventario, public.enum_execucao_inventario, boolean, date, uuid, uuid, uuid, uuid, public.enum_criterio_selecao_inventario, public.enum_curva, integer, boolean);

ALTER FUNCTION public.fn_gerar_tarefas_inventario(uuid, uuid, integer)
  RENAME TO fn_gerar_tarefas_inventario_internal;

REVOKE ALL ON FUNCTION public.fn_gerar_tarefas_inventario_internal(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_gerar_tarefas_inventario_internal(uuid, uuid, integer) TO service_role;

CREATE FUNCTION public.fn_gerar_tarefas_inventario(
  p_tenant_id uuid,
  p_inventario_id uuid,
  p_chunk_size integer DEFAULT 200
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_tenant uuid;
BEGIN
  v_auth_tenant := public.get_current_tenant();
  IF auth.uid() IS NULL OR v_auth_tenant IS NULL OR v_auth_tenant <> p_tenant_id THEN
    RETURN json_build_object('sucesso', false, 'codigo', 'CONTEXTO_TENANT_INVALIDO');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.inventario i
    WHERE i.id = p_inventario_id
      AND i.tenant_id = p_tenant_id
  ) THEN
    RETURN json_build_object('sucesso', false, 'codigo', 'INVENTARIO_NAO_ENCONTRADO');
  END IF;

  RETURN public.fn_gerar_tarefas_inventario_internal(
    p_tenant_id,
    p_inventario_id,
    LEAST(GREATEST(COALESCE(p_chunk_size, 200), 1), 500)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_gerar_tarefas_inventario(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_gerar_tarefas_inventario(uuid, uuid, integer) TO authenticated, service_role;