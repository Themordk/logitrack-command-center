-- =====================================================================
-- Fluxo de Expedição · F8 · 99 — REVERSÃO do pacote
-- Devolve o banco ao ponto da foto (00_foto_pre_deploy.sql), comparando o
-- estado atual com deploy_f8:
--   · funções e gatilhos alterados voltam ao corpo e às permissões da foto;
--   · funções, gatilhos, tabelas, colunas, índices, restrições, políticas e
--     tipos criados depois da foto são removidos;
--   · módulos/permissões criados depois da foto são removidos e o campo
--     "ativo" dos módulos volta ao valor da foto.
-- ATENÇÃO: os dados das tabelas novas (cargas, grupos de separação e de
-- conferência, roteiro) são apagados junto com as tabelas.
-- Trava de segurança: não roda com carga liberada ou em carregamento, a menos
-- que a sessão defina  SET logitrack.reversao_forcar = 'on';
-- Tudo numa transação: qualquer erro desfaz a reversão inteira.
-- =====================================================================
BEGIN;
SET LOCAL check_function_bodies = off;
SET LOCAL lock_timeout = '10s';

DO $$
DECLARE r record; v_atual text; v_n int := 0; v_cargas int := 0;
BEGIN
  IF to_regnamespace('deploy_f8') IS NULL THEN
    RAISE EXCEPTION 'Foto deploy_f8 não encontrada: reversão automática impossível.';
  END IF;

  IF to_regclass('public.carga') IS NOT NULL THEN
    EXECUTE $q$SELECT count(*) FROM public.carga WHERE status IN ('LIBERADA','EM_CARREGAMENTO')$q$ INTO v_cargas;
    IF v_cargas > 0 AND COALESCE(current_setting('logitrack.reversao_forcar', true), '') <> 'on' THEN
      RAISE EXCEPTION 'Há % carga(s) liberada(s) ou em carregamento. Conclua ou cancele antes, ou force com SET logitrack.reversao_forcar = ''on''.', v_cargas;
    END IF;
  END IF;

  -- 1) gatilhos novos em tabelas antigas: remover
  FOR r IN SELECT c.oid::regclass::text AS tabela, t.tgname AS nome
             FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE NOT t.tgisinternal AND n.nspname IN ('public','integracao')
              AND EXISTS (SELECT 1 FROM deploy_f8.relacao x WHERE x.nome = c.oid::regclass::text)
              AND NOT EXISTS (SELECT 1 FROM deploy_f8.gatilho g WHERE g.tabela = c.oid::regclass::text AND g.nome = t.tgname) LOOP
    EXECUTE format('DROP TRIGGER %I ON %s', r.nome, r.tabela); v_n := v_n + 1;
  END LOOP;
  RAISE NOTICE '1) gatilhos novos removidos: %', v_n; v_n := 0;

  -- 2) funções alteradas: voltar ao corpo da foto
  FOR r IN SELECT f.* FROM deploy_f8.funcao f
            WHERE to_regprocedure(f.sig) IS NOT NULL
              AND pg_get_functiondef(to_regprocedure(f.sig)) IS DISTINCT FROM f.def LOOP
    BEGIN
      EXECUTE r.def;
    EXCEPTION WHEN invalid_function_definition OR duplicate_function OR feature_not_supported THEN
      EXECUTE format('DROP FUNCTION %s', r.sig);   -- retorno/parâmetros mudaram: recriar
      EXECUTE r.def;
    END;
    v_n := v_n + 1;
  END LOOP;
  -- funções que sumiram (DROP no pacote) também voltam
  FOR r IN SELECT f.* FROM deploy_f8.funcao f WHERE to_regprocedure(f.sig) IS NULL LOOP
    EXECUTE r.def; v_n := v_n + 1;
  END LOOP;
  RAISE NOTICE '2) funções restauradas: %', v_n; v_n := 0;

  -- 2b) permissões de execução das funções da foto
  FOR r IN SELECT f.sig FROM deploy_f8.funcao f LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', r.sig);
  END LOOP;
  FOR r IN SELECT g.sig, g.grantee FROM deploy_f8.funcao_grant g JOIN deploy_f8.funcao f ON f.sig = g.sig LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %s', r.sig, r.grantee);
  END LOOP;

  -- 3) gatilhos alterados ou removidos: voltar à definição da foto
  FOR r IN SELECT g.* FROM deploy_f8.gatilho g WHERE to_regclass(g.tabela) IS NOT NULL LOOP
    SELECT pg_get_triggerdef(t.oid) INTO v_atual FROM pg_trigger t
     WHERE t.tgrelid = to_regclass(r.tabela) AND t.tgname = r.nome AND NOT t.tgisinternal;
    IF v_atual IS DISTINCT FROM r.def THEN
      IF v_atual IS NOT NULL THEN EXECUTE format('DROP TRIGGER %I ON %s', r.nome, r.tabela); END IF;
      EXECUTE r.def; v_n := v_n + 1;
    END IF;
  END LOOP;
  RAISE NOTICE '3) gatilhos restaurados: %', v_n; v_n := 0;

  -- 4) relações novas: views, depois tabelas, depois sequências
  FOR r IN SELECT c.oid::regclass::text AS nome, c.relkind
             FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname IN ('public','integracao') AND c.relkind IN ('v','m','r','p','S')
              AND NOT EXISTS (SELECT 1 FROM deploy_f8.relacao x WHERE x.nome = c.oid::regclass::text)
            ORDER BY CASE c.relkind WHEN 'v' THEN 1 WHEN 'm' THEN 1 WHEN 'S' THEN 3 ELSE 2 END LOOP
    IF to_regclass(r.nome) IS NOT NULL THEN
      EXECUTE format('DROP %s IF EXISTS %s CASCADE',
        CASE r.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' WHEN 'S' THEN 'SEQUENCE' ELSE 'TABLE' END, r.nome);
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RAISE NOTICE '4) tabelas/views/sequências novas removidas: %', v_n; v_n := 0;

  -- 5) colunas novas em tabelas antigas
  FOR r IN SELECT c.oid::regclass::text AS tabela, a.attname AS nome
             FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname IN ('public','integracao') AND c.relkind IN ('r','p') AND a.attnum > 0 AND NOT a.attisdropped
              AND EXISTS (SELECT 1 FROM deploy_f8.relacao x WHERE x.nome = c.oid::regclass::text)
              AND NOT EXISTS (SELECT 1 FROM deploy_f8.coluna k WHERE k.tabela = c.oid::regclass::text AND k.nome = a.attname) LOOP
    EXECUTE format('ALTER TABLE %s DROP COLUMN IF EXISTS %I CASCADE', r.tabela, r.nome); v_n := v_n + 1;
  END LOOP;
  RAISE NOTICE '5) colunas novas removidas: %', v_n; v_n := 0;

  -- 6) restrições e índices novos que sobraram em tabelas antigas
  FOR r IN SELECT co.conrelid::regclass::text AS tabela, co.conname AS nome
             FROM pg_constraint co JOIN pg_namespace n ON n.oid = co.connamespace
            WHERE n.nspname IN ('public','integracao') AND co.conrelid <> 0
              AND NOT EXISTS (SELECT 1 FROM deploy_f8.restricao x WHERE x.tabela = co.conrelid::regclass::text AND x.nome = co.conname) LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I CASCADE', r.tabela, r.nome); v_n := v_n + 1;
  END LOOP;
  FOR r IN SELECT i.indexrelid::regclass::text AS nome
             FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname IN ('public','integracao')
              AND NOT EXISTS (SELECT 1 FROM deploy_f8.indice x WHERE x.nome = i.indexrelid::regclass::text) LOOP
    EXECUTE format('DROP INDEX IF EXISTS %s', r.nome); v_n := v_n + 1;
  END LOOP;
  RAISE NOTICE '6) restrições/índices novos removidos: %', v_n; v_n := 0;

  -- 7) políticas novas em tabelas antigas
  FOR r IN SELECT p.schemaname || '.' || p.tablename AS tabela, p.policyname AS nome FROM pg_policies p
            WHERE p.schemaname IN ('public','integracao')
              AND NOT EXISTS (SELECT 1 FROM deploy_f8.politica x WHERE x.tabela = p.schemaname || '.' || p.tablename AND x.nome = p.policyname) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %s', r.nome, r.tabela); v_n := v_n + 1;
  END LOOP;
  RAISE NOTICE '7) políticas novas removidas: %', v_n; v_n := 0;

  -- 8) funções novas (inclui as cópias _bkp_* criadas pelo pacote)
  FOR r IN SELECT p.oid::regprocedure::text AS sig
             FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname IN ('public','integracao') AND p.prokind IN ('f','p')
              AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
              AND NOT EXISTS (SELECT 1 FROM deploy_f8.funcao f WHERE f.sig = p.oid::regprocedure::text) LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.sig); v_n := v_n + 1;
  END LOOP;
  RAISE NOTICE '8) funções novas removidas: %', v_n; v_n := 0;

  -- 9) tipos novos (enums do roteiro e do embarque)
  FOR r IN SELECT t.oid::regtype::text AS nome FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE n.nspname IN ('public','integracao') AND t.typtype IN ('e','c','d')
              AND NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.reltype = t.oid)
              AND NOT EXISTS (SELECT 1 FROM deploy_f8.tipo x WHERE x.nome = t.oid::regtype::text) LOOP
    EXECUTE format('DROP TYPE IF EXISTS %s CASCADE', r.nome); v_n := v_n + 1;
  END LOOP;
  RAISE NOTICE '9) tipos novos removidos: %', v_n; v_n := 0;

  -- 10) módulos e permissões
  DELETE FROM public.perfil_permissao pp WHERE NOT EXISTS (SELECT 1 FROM deploy_f8.perfil_permissao x WHERE x.id = pp.id);
  DELETE FROM public.permissao p WHERE NOT EXISTS (SELECT 1 FROM deploy_f8.permissao x WHERE x.id = p.id);
  DELETE FROM public.modulo m WHERE NOT EXISTS (SELECT 1 FROM deploy_f8.modulo x WHERE x.id = m.id);
  UPDATE public.modulo m SET ativo = x.ativo FROM deploy_f8.modulo x WHERE x.id = m.id AND m.ativo IS DISTINCT FROM x.ativo;
  RAISE NOTICE '10) módulos e permissões devolvidos à foto';

  -- 11) conferência final: nada pode ter ficado diferente nas funções
  SELECT count(*) INTO v_n FROM deploy_f8.funcao f
   WHERE to_regprocedure(f.sig) IS NULL OR pg_get_functiondef(to_regprocedure(f.sig)) IS DISTINCT FROM f.def;
  IF v_n > 0 THEN RAISE EXCEPTION 'Reversão incompleta: % função(ões) ainda diferentes da foto.', v_n; END IF;
  RAISE NOTICE 'Reversão concluída: banco igual à foto de %', (SELECT tirada_em FROM deploy_f8.info);
END $$;

COMMIT;
-- Depois de validar a operação, a foto pode ser descartada:  DROP SCHEMA deploy_f8 CASCADE;
