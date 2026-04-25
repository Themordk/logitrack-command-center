
-- Função genérica de validação: usuário só pode operar na sua própria empresa,
-- exceto se possuir perfil ADMINISTRADOR.
CREATE OR REPLACE FUNCTION public.fn_validar_empresa_usuario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean := false;
  v_user_empresa uuid;
  v_auth uuid;
BEGIN
  v_auth := auth.uid();
  -- Sem contexto auth (jobs internos, service_role) → permite
  IF v_auth IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM usuario u
    JOIN usuario_perfil up ON up.usuario_id = u.id
    JOIN perfil p ON p.id = up.perfil_id
    WHERE u.auth_user_id = v_auth
      AND p.nome = 'ADMINISTRADOR'
  ) INTO v_is_admin;

  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  SELECT empresa_id INTO v_user_empresa
  FROM usuario
  WHERE auth_user_id = v_auth
  LIMIT 1;

  -- Usuário sem registro operacional → não bloqueia (compatibilidade)
  IF v_user_empresa IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.empresa_id IS DISTINCT FROM v_user_empresa THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pode operar nesta empresa (empresa_id=%).', NEW.empresa_id
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- Aplica trigger nas tabelas operacionais com coluna empresa_id.
-- DROP idempotente seguido de CREATE.
DO $$
DECLARE
  t text;
  tabelas text[] := ARRAY[
    'movimento_entrada',
    'movimento_saida',
    'documento_entrada',
    'documento_saida',
    'produto',
    'parceiro',
    'inventario',
    'abastecimento',
    'armazem',
    'grupo_produto'
  ];
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_validar_empresa_usuario ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_validar_empresa_usuario
         BEFORE INSERT OR UPDATE ON public.%I
         FOR EACH ROW
         EXECUTE FUNCTION public.fn_validar_empresa_usuario()',
      t
    );
  END LOOP;
END$$;
