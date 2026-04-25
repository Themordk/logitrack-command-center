-- Estende validação de empresa para tabelas com empresa_id direto
DO $$
DECLARE
  t text;
  tabelas text[] := ARRAY[
    'veiculos',
    'hu',
    'volume_expedicao'
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

-- Função de validação por armazém: garante que NEW.armazem_id pertence à empresa do usuário
CREATE OR REPLACE FUNCTION public.fn_validar_armazem_empresa_usuario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean := false;
  v_user_empresa uuid;
  v_armazem_empresa uuid;
  v_auth uuid;
BEGIN
  v_auth := auth.uid();
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

  IF v_user_empresa IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.armazem_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT empresa_id INTO v_armazem_empresa
  FROM armazem
  WHERE id = NEW.armazem_id
  LIMIT 1;

  IF v_armazem_empresa IS NULL OR v_armazem_empresa IS DISTINCT FROM v_user_empresa THEN
    RAISE EXCEPTION 'Acesso negado: armazém % não pertence à empresa do usuário.', NEW.armazem_id
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- Aplica trigger nas tabelas que dependem de armazem_id (sem empresa_id direto)
DO $$
DECLARE
  t text;
  tabelas text[] := ARRAY[
    'tipo_estoque',
    'setor',
    'endereco',
    'box',
    'turnos',
    'motivo_ocorrencia',
    'zona_atividade',
    'tipo_box'
  ];
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_validar_armazem_empresa_usuario ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_validar_armazem_empresa_usuario
         BEFORE INSERT OR UPDATE ON public.%I
         FOR EACH ROW
         EXECUTE FUNCTION public.fn_validar_armazem_empresa_usuario()',
      t
    );
  END LOOP;
END$$;