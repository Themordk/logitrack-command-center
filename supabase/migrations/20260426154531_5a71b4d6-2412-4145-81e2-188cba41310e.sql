DO $$
DECLARE
  v_email text := 'suporte.corelogitrack@gmail.com';
  v_pass  text := 'Suporte@Core2026';
  v_uid   uuid;
BEGIN
  -- Verifica se já existe em auth.users
  SELECT id INTO v_uid FROM auth.users WHERE email = v_email LIMIT 1;

  IF v_uid IS NULL THEN
    v_uid := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_uid, 'authenticated', 'authenticated', v_email,
      crypt(v_pass, gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"role":"platform_support"}'::jsonb,
      now(), now(), '', '', '', ''
    );

    INSERT INTO auth.identities (
      id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_uid, v_uid::text,
      jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
      'email', now(), now(), now()
    );
  END IF;

  -- Garante o vínculo em platform_support_user
  INSERT INTO public.platform_support_user (auth_user_id, email, nome, ativo)
  VALUES (v_uid, v_email, 'Suporte CORE LogiTrack', true)
  ON CONFLICT (auth_user_id) DO UPDATE SET
    ativo = true,
    nome = EXCLUDED.nome;
END $$;