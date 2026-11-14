-- =====================================================================
-- Fluxo de Expedição · F8 · 00 — foto do banco ANTES do pacote
-- Rodar imediatamente antes das migrations 20261112132050 … 20261114140439.
-- Guarda, num schema fechado (deploy_f8), tudo o que a reversão (99) precisa
-- para devolver o banco a este ponto: funções com corpo e permissões,
-- gatilhos, tabelas, colunas, índices, tipos, políticas e as linhas de
-- módulo/permissão. Não altera nada fora do schema deploy_f8.
-- =====================================================================
DO $$
BEGIN
  IF to_regnamespace('deploy_f8') IS NOT NULL THEN
    RAISE EXCEPTION 'deploy_f8 já existe: a foto já foi tirada. Apague o schema só se tiver certeza de que o pacote não foi aplicado.';
  END IF;
END $$;

CREATE SCHEMA deploy_f8;
REVOKE ALL ON SCHEMA deploy_f8 FROM PUBLIC, anon, authenticated;

CREATE TABLE deploy_f8.info AS SELECT now() AS tirada_em, current_user AS por;

CREATE TABLE deploy_f8.funcao AS
SELECT p.oid::regprocedure::text AS sig, n.nspname AS esquema, p.proname AS nome,
       pg_get_functiondef(p.oid) AS def, pg_get_function_result(p.oid) AS retorno
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname IN ('public','integracao') AND p.prokind IN ('f','p')
   AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e');  -- sem funções de extensão

CREATE TABLE deploy_f8.funcao_grant AS
SELECT p.oid::regprocedure::text AS sig,
       CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(r.rolname) END AS grantee
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
  LEFT JOIN pg_roles r ON r.oid = a.grantee
 WHERE n.nspname IN ('public','integracao') AND p.prokind IN ('f','p') AND a.privilege_type = 'EXECUTE'
   AND a.grantee <> p.proowner;

CREATE TABLE deploy_f8.gatilho AS
SELECT c.oid::regclass::text AS tabela, t.tgname AS nome, pg_get_triggerdef(t.oid) AS def
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE NOT t.tgisinternal AND n.nspname IN ('public','integracao');

CREATE TABLE deploy_f8.relacao AS
SELECT c.oid::regclass::text AS nome, c.relkind AS tipo
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname IN ('public','integracao') AND c.relkind IN ('r','p','v','m','S');

CREATE TABLE deploy_f8.coluna AS
SELECT c.oid::regclass::text AS tabela, a.attname AS nome
  FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname IN ('public','integracao') AND c.relkind IN ('r','p') AND a.attnum > 0 AND NOT a.attisdropped;

CREATE TABLE deploy_f8.indice AS
SELECT i.indexrelid::regclass::text AS nome, i.indrelid::regclass::text AS tabela
  FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname IN ('public','integracao');

CREATE TABLE deploy_f8.restricao AS
SELECT co.conrelid::regclass::text AS tabela, co.conname AS nome
  FROM pg_constraint co JOIN pg_namespace n ON n.oid = co.connamespace
 WHERE n.nspname IN ('public','integracao') AND co.conrelid <> 0;

CREATE TABLE deploy_f8.politica AS
SELECT schemaname || '.' || tablename AS tabela, policyname AS nome FROM pg_policies WHERE schemaname IN ('public','integracao');

CREATE TABLE deploy_f8.tipo AS
SELECT t.oid::regtype::text AS nome
  FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
 WHERE n.nspname IN ('public','integracao') AND t.typtype IN ('e','c','d')
   AND NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.reltype = t.oid);

CREATE TABLE deploy_f8.modulo           AS SELECT id, codigo, ativo FROM public.modulo;
CREATE TABLE deploy_f8.permissao        AS SELECT id FROM public.permissao;
CREATE TABLE deploy_f8.perfil_permissao AS SELECT id FROM public.perfil_permissao;

REVOKE ALL ON ALL TABLES IN SCHEMA deploy_f8 FROM PUBLIC, anon, authenticated;

SELECT (SELECT count(*) FROM deploy_f8.funcao) AS funcoes, (SELECT count(*) FROM deploy_f8.gatilho) AS gatilhos,
       (SELECT count(*) FROM deploy_f8.relacao) AS relacoes, (SELECT count(*) FROM deploy_f8.coluna) AS colunas,
       (SELECT count(*) FROM deploy_f8.modulo) AS modulos;
