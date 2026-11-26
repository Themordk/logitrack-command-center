-- =====================================================================
-- 2026-11-26 · Retorno ao ERP · novos eventos (02/03) — botão "Importar do ERP"
--
-- Cenário A do plano: o botão "Importar do ERP" das telas de cadastro e de
-- documentos passa a poder ser configurado no Motor de Retorno, em vez de
-- depender só do código fixo (sync-entidade, Omie).
--
-- Fluxo típico (configurado pelo cliente ou pelo suporte):
--   gatilho importar.produto -> Requisição HTTP (GET no ERP)
--   -> Montar payload (resposta do ERP -> contrato da API LogiTrack)
--   -> Confirmar com o usuário (opcional: prévia) -> Gravar no LogiTrack
--
-- Peças:
--   integracao.retorno_importacao_recurso  evento -> rota da API, módulo de permissão
--   integracao.retorno_importacao          o pedido do usuário (o "documento" da execução)
--   nós novos: logica.confirmar_usuario, acao.gravar_logitrack
--   RPCs: integracao_retorno_importacao_{disponivel,iniciar,obter,confirmar,cancelar,testar}
--   serviço (só service_role): integracao_retorno_svc_chave_api, integracao_retorno_svc_importacao_registrar
--
-- "Gravar no LogiTrack" chama a própria API (integration-gateway) com a chave
-- da conexão ERP ativa da empresa (integracao.erp_conexao.webhook_secret, a mesma
-- que o ERP usa): mesma validação, idempotência e log da API pública, sem
-- duplicar regra de gravação e sem alterar o gateway.
-- Reverter: supabase/rollback/20261126_retorno_novos_eventos_reverter.sql
-- =====================================================================

-- ---------- 1. recursos (evento -> rota da API) ----------
CREATE TABLE IF NOT EXISTS integracao.retorno_importacao_recurso (
  evento        text        NOT NULL,
  entidade_wms  text        NOT NULL,
  rota          text        NOT NULL,
  modulo        text        NOT NULL,
  tela          text        NOT NULL,
  ordem         integer     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT retorno_importacao_recurso_pkey PRIMARY KEY (evento)
);
COMMENT ON TABLE integracao.retorno_importacao_recurso IS
  'Botões "Importar do ERP": evento do motor de retorno, rota da API LogiTrack usada pelo nó "Gravar no LogiTrack" e módulo de permissão da tela.';
-- Catálogo global, lido só pelas funções do motor (SECURITY DEFINER): RLS ligado e sem policy.
ALTER TABLE integracao.retorno_importacao_recurso ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_retorno_importacao_recurso_updated_at ON integracao.retorno_importacao_recurso;
CREATE TRIGGER trg_retorno_importacao_recurso_updated_at BEFORE UPDATE ON integracao.retorno_importacao_recurso
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO integracao.retorno_importacao_recurso (evento, entidade_wms, rota, modulo, tela, ordem) VALUES
 ('importar.produto',           'produto',           'master-data/produtos',        'web.dados-mestres.produtos',      'Produtos',            300),
 ('importar.parceiro',          'parceiro',          'master-data/parceiros',       'web.dados-mestres.parceiros',     'Parceiros',           301),
 ('importar.grupo_produto',     'grupo_produto',     'master-data/grupos',          'web.dados-mestres.grupos',        'Grupos de produto',   302),
 ('importar.subgrupo_produto',  'subgrupo_produto',  'master-data/subgrupos',       'web.dados-mestres.subgrupos',     'Subgrupos de produto',303),
 ('importar.rota',              'rota',              'master-data/rotas',           'web.dados-mestres.rotas',         'Rotas',               304),
 ('importar.tipo_entrada',      'tipo_entrada',      'master-data/tipos-entrada',   'web.dados-mestres.tipos-entrada', 'Tipos de entrada',    305),
 ('importar.tipo_saida',        'tipo_saida',        'master-data/tipos-saida',     'web.dados-mestres.tipos-saida',   'Tipos de saída',      306),
 ('importar.documento_entrada', 'documento_entrada', 'movements/documentos-entrada','web.atividades.entradas',         'Entradas',            307),
 ('importar.documento_saida',   'documento_saida',   'movements/documentos-saida',  'web.atividades.saidas',           'Saídas',              308)
ON CONFLICT (evento) DO UPDATE SET entidade_wms = EXCLUDED.entidade_wms, rota = EXCLUDED.rota, modulo = EXCLUDED.modulo,
  tela = EXCLUDED.tela, ordem = EXCLUDED.ordem;

-- ---------- 2. catálogo de eventos e de nós ----------
INSERT INTO integracao.retorno_evento_catalogo (codigo, entidade, origem_tabela, status_origem, nome, descricao, ordem, ativo)
SELECT r.evento, 'cadastro_importacao', 'importar_erp', r.entidade_wms,
       'Importar do ERP · ' || r.tela,
       format('Botão "Importar do ERP" da tela %s. O contexto traz importacao.valor (o que o usuário digitou) e importacao.tipo_busca. '
              'Busque no ERP com Requisição HTTP, converta com Montar payload e grave com "Gravar no LogiTrack" (POST /%s). '
              'Roda na hora, com o usuário esperando: use o modo imediato.', r.tela, r.rota),
       r.ordem, true
FROM integracao.retorno_importacao_recurso r
ON CONFLICT (codigo) DO UPDATE SET nome = EXCLUDED.nome, descricao = EXCLUDED.descricao, ordem = EXCLUDED.ordem,
  entidade = EXCLUDED.entidade, origem_tabela = EXCLUDED.origem_tabela, status_origem = EXCLUDED.status_origem, ativo = true;

INSERT INTO integracao.retorno_no_catalogo (tipo, grupo, nome, descricao, saidas, config_exemplo, disponivel, ordem) VALUES
 ('logica.confirmar_usuario', 'logica', 'Confirmar com o usuário',
  'Pausa a importação e mostra a prévia ao usuário; só continua quando ele confirma (expira em alguns minutos). Só no botão Importar do ERP.',
  ARRAY['principal'],
  '{"titulo": "Confirme a importação", "mensagem": "Registro {{importacao.valor}} encontrado no ERP.", "previa_de": "<id do nó payload>", "expira_minutos": 15}'::jsonb,
  true, 45),
 ('acao.gravar_logitrack', 'acao', 'Gravar no LogiTrack',
  'Envia o payload para a API do LogiTrack (mesmo contrato da API pública) na rota do cadastro do botão. Sucesso devolve o registro gravado em saidas.<id>. Só no botão Importar do ERP.',
  ARRAY['sucesso', 'erro'],
  '{"corpo_de": "<id do nó payload>"}'::jsonb,
  true, 95)
ON CONFLICT (tipo) DO UPDATE SET grupo = EXCLUDED.grupo, nome = EXCLUDED.nome, descricao = EXCLUDED.descricao,
  saidas = EXCLUDED.saidas, config_exemplo = EXCLUDED.config_exemplo, disponivel = EXCLUDED.disponivel, ordem = EXCLUDED.ordem;

-- ---------- 3. pedido de importação ----------
CREATE TABLE IF NOT EXISTS integracao.retorno_importacao (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES public.tenant(id),
  empresa_id      uuid        NOT NULL REFERENCES public.empresa(id),
  evento          text        NOT NULL REFERENCES integracao.retorno_importacao_recurso(evento),
  fluxo_id        uuid        REFERENCES integracao.retorno_fluxo(id) ON DELETE SET NULL,
  execucao_id     uuid        REFERENCES integracao.retorno_execucao(id) ON DELETE SET NULL,
  valor           text        NOT NULL,
  parametros      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  teste           boolean     NOT NULL DEFAULT false,
  usuario_id      uuid        REFERENCES public.usuario(id),
  registro_id     uuid,
  registro_status text,
  resposta        jsonb,
  gravado_em      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid        REFERENCES public.usuario(id),
  CONSTRAINT retorno_importacao_pkey PRIMARY KEY (id)
);
COMMENT ON TABLE integracao.retorno_importacao IS
  'Pedido feito pelo botão "Importar do ERP" (ou pelo teste do editor). É o "documento" das execuções da entidade cadastro_importacao.';
CREATE INDEX IF NOT EXISTS idx_retorno_importacao_tenant_id  ON integracao.retorno_importacao (tenant_id);
CREATE INDEX IF NOT EXISTS idx_retorno_importacao_empresa_id ON integracao.retorno_importacao (empresa_id);
CREATE INDEX IF NOT EXISTS idx_retorno_importacao_lista      ON integracao.retorno_importacao (tenant_id, empresa_id, evento, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_retorno_importacao_evento     ON integracao.retorno_importacao (evento);
CREATE INDEX IF NOT EXISTS idx_retorno_importacao_fluxo      ON integracao.retorno_importacao (fluxo_id);
CREATE INDEX IF NOT EXISTS idx_retorno_importacao_execucao   ON integracao.retorno_importacao (execucao_id);
CREATE INDEX IF NOT EXISTS idx_retorno_importacao_usuario    ON integracao.retorno_importacao (usuario_id);
CREATE INDEX IF NOT EXISTS idx_retorno_importacao_created_by ON integracao.retorno_importacao (created_by);
ALTER TABLE integracao.retorno_importacao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS retorno_importacao_tenant_select ON integracao.retorno_importacao;
CREATE POLICY retorno_importacao_tenant_select ON integracao.retorno_importacao
  FOR SELECT TO authenticated USING (tenant_id = (SELECT public.get_current_tenant()));
DROP TRIGGER IF EXISTS trg_retorno_importacao_updated_at ON integracao.retorno_importacao;
CREATE TRIGGER trg_retorno_importacao_updated_at BEFORE UPDATE ON integracao.retorno_importacao
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 4. contexto ----------
CREATE OR REPLACE FUNCTION integracao.fn_retorno_contexto_importacao(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'integracao'
AS $function$
  SELECT jsonb_build_object(
    'operador', (SELECT jsonb_build_object('id', u.id, 'login', u.login, 'nome', u.nome) FROM usuario u WHERE u.id = i.usuario_id),
    'importacao', jsonb_build_object(
      'id', i.id, 'evento', i.evento, 'entidade', r.entidade_wms, 'tela', r.tela, 'rota', r.rota,
      'valor', i.valor, 'tipo_busca', i.parametros->>'tipo_busca', 'parametros', i.parametros,
      'teste', i.teste,
      'solicitado_em', to_char(i.created_at AT TIME ZONE 'America/Fortaleza', 'YYYY-MM-DD"T"HH24:MI:SS"-03:00"')))
  FROM integracao.retorno_importacao i
  JOIN integracao.retorno_importacao_recurso r ON r.evento = i.evento
  WHERE i.id = p_id;
$function$;
REVOKE ALL ON FUNCTION integracao.fn_retorno_contexto_importacao(uuid) FROM public, anon, authenticated;

-- ---------- 5. autorização ----------
-- Usa a permissão da TELA do botão (ex.: CREATE em Produtos), não a de Integração.
CREATE OR REPLACE FUNCTION integracao.fn_retorno_importacao_autorizar(p_tenant_id uuid, p_empresa_id uuid, p_modulo text, p_acao text DEFAULT 'CREATE')
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'integracao'
AS $function$
DECLARE v_usuario uuid;
BEGIN
  IF p_tenant_id IS NULL OR p_empresa_id IS NULL THEN
    RAISE EXCEPTION 'RETORNO_PARAMETROS: tenant_id e empresa_id são obrigatórios' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'RETORNO_NAO_AUTENTICADO' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM empresa e WHERE e.id = p_empresa_id AND e.tenant_id = p_tenant_id) THEN
    RAISE EXCEPTION 'RETORNO_EMPRESA_INVALIDA' USING ERRCODE = '42501';
  END IF;
  IF is_platform_support(auth.uid()) THEN
    RETURN NULL;
  END IF;
  IF p_tenant_id IS DISTINCT FROM get_current_tenant() THEN
    RAISE EXCEPTION 'RETORNO_ACESSO_NEGADO' USING ERRCODE = '42501';
  END IF;
  SELECT u.id INTO v_usuario FROM usuario u
   WHERE u.auth_user_id = auth.uid() AND u.tenant_id = p_tenant_id AND u.ativo
   LIMIT 1;
  IF v_usuario IS NULL THEN
    RAISE EXCEPTION 'RETORNO_ACESSO_NEGADO' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM usuario_perfil up WHERE up.usuario_id = v_usuario)
     OR EXISTS (SELECT 1 FROM usuario_perfil up JOIN perfil p ON p.id = up.perfil_id
                WHERE up.usuario_id = v_usuario AND p.nome = 'ADMINISTRADOR')
     OR fn_usuario_tem_permissao(v_usuario, p_modulo, p_acao) THEN
    RETURN v_usuario;
  END IF;
  RAISE EXCEPTION 'RETORNO_IMPORTACAO_SEM_PERMISSAO: requer %/%', p_modulo, p_acao USING ERRCODE = '42501';
END;
$function$;
REVOKE ALL ON FUNCTION integracao.fn_retorno_importacao_autorizar(uuid, uuid, text, text) FROM public, anon, authenticated;

-- Execução de importação vista pelo usuário: quem pediu, suporte, ou quem lê os retornos.
CREATE OR REPLACE FUNCTION integracao.fn_retorno_importacao_execucao(p_execucao_id uuid, p_lock boolean DEFAULT false)
 RETURNS integracao.retorno_execucao
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'integracao'
AS $function$
DECLARE e integracao.retorno_execucao; v_dono uuid;
BEGIN
  IF p_lock THEN
    SELECT * INTO e FROM integracao.retorno_execucao WHERE id = p_execucao_id FOR UPDATE;
  ELSE
    SELECT * INTO e FROM integracao.retorno_execucao WHERE id = p_execucao_id;
  END IF;
  IF NOT FOUND OR e.entidade <> 'cadastro_importacao' THEN
    RAISE EXCEPTION 'RETORNO_EXECUCAO_NAO_ENCONTRADA' USING ERRCODE = 'P0002';
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'RETORNO_NAO_AUTENTICADO' USING ERRCODE = '42501';
  END IF;
  IF is_platform_support(auth.uid()) THEN RETURN e; END IF;
  SELECT i.usuario_id INTO v_dono FROM integracao.retorno_importacao i WHERE i.id = e.documento_id;
  IF v_dono IS NOT NULL AND EXISTS (SELECT 1 FROM usuario u WHERE u.id = v_dono AND u.auth_user_id = auth.uid() AND u.tenant_id = e.tenant_id) THEN
    RETURN e;
  END IF;
  PERFORM integracao.fn_retorno_autorizar(e.tenant_id, e.empresa_id, 'READ');
  RETURN e;
END;
$function$;
REVOKE ALL ON FUNCTION integracao.fn_retorno_importacao_execucao(uuid, boolean) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION integracao.fn_retorno_importacao_json(e integracao.retorno_execucao)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'integracao'
AS $function$
  SELECT jsonb_build_object(
    'execucao_id', e.id,
    'importacao_id', i.id,
    'evento', e.evento,
    'entidade', r.entidade_wms,
    'tela', r.tela,
    'modo', e.modo,
    'status', e.status,
    'finalizado', e.status IN ('sucesso', 'erro', 'filtrado', 'descartado'),
    'valor', i.valor,
    'parametros', i.parametros,
    'fluxo_id', e.fluxo_id,
    'fluxo_nome', (SELECT f.nome FROM integracao.retorno_fluxo f WHERE f.id = e.fluxo_id),
    'aguardando_confirmacao', e.status = 'aguardando_confirmacao',
    'confirmacao', CASE WHEN e.status = 'aguardando_confirmacao' THEN
                     coalesce(e.estado->'confirmacao', '{}'::jsonb) || jsonb_build_object('expira_em', e.processar_apos) END,
    'previa', e.estado->'previa',
    'registro', CASE WHEN i.gravado_em IS NULL THEN NULL ELSE jsonb_build_object(
                  'id', i.registro_id, 'status', i.registro_status, 'gravado_em', i.gravado_em, 'dados', i.resposta) END,
    'erro', e.erro,
    'erro_http_status', e.erro_http_status,
    'created_at', e.created_at,
    'finalizado_em', e.finalizado_em,
    'passos', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                 'no_id', p.no_id, 'no_tipo', p.no_tipo, 'status', p.status, 'saida', p.saida,
                 'erro', p.erro, 'http_status', p.http_status, 'duracao_ms', p.duracao_ms) ORDER BY p.seq), '[]'::jsonb)
               FROM integracao.retorno_execucao_passo p WHERE p.execucao_id = e.id))
  FROM integracao.retorno_importacao i
  JOIN integracao.retorno_importacao_recurso r ON r.evento = i.evento
  WHERE i.id = e.documento_id;
$function$;
REVOKE ALL ON FUNCTION integracao.fn_retorno_importacao_json(integracao.retorno_execucao) FROM public, anon, authenticated;

-- ---------- 6. RPCs do botão ----------
CREATE OR REPLACE FUNCTION public.integracao_retorno_importacao_disponivel(p_tenant_id uuid, p_empresa_id uuid, p_evento text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'integracao'
AS $function$
BEGIN
  IF p_tenant_id IS NULL OR p_empresa_id IS NULL THEN
    RAISE EXCEPTION 'RETORNO_PARAMETROS: tenant_id e empresa_id são obrigatórios' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'RETORNO_NAO_AUTENTICADO' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM empresa e WHERE e.id = p_empresa_id AND e.tenant_id = p_tenant_id) THEN
    RAISE EXCEPTION 'RETORNO_EMPRESA_INVALIDA' USING ERRCODE = '42501';
  END IF;
  IF NOT is_platform_support(auth.uid()) AND p_tenant_id IS DISTINCT FROM get_current_tenant() THEN
    RAISE EXCEPTION 'RETORNO_ACESSO_NEGADO' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'evento', r.evento, 'entidade', r.entidade_wms, 'tela', r.tela,
             'fluxos_ativos', coalesce(x.qt, 0),
             'disponivel', coalesce(x.qt, 0) = 1,
             'fluxo_id', CASE WHEN x.qt = 1 THEN x.fluxo_id END,
             'fluxo_nome', CASE WHEN x.qt = 1 THEN x.fluxo_nome END,
             'tem_confirmacao', CASE WHEN x.qt = 1 THEN x.tem_confirmacao ELSE false END) ORDER BY r.ordem), '[]'::jsonb)
    FROM integracao.retorno_importacao_recurso r
    LEFT JOIN LATERAL (
      SELECT count(*) AS qt, (array_agg(f.id))[1] AS fluxo_id, (array_agg(f.nome))[1] AS fluxo_nome,
             bool_or(EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(f.definicao_publicada->'nos', '[]'::jsonb)) n
                             WHERE n->>'tipo' = 'logica.confirmar_usuario')) AS tem_confirmacao
      FROM integracao.retorno_fluxo f
      WHERE f.tenant_id = p_tenant_id AND f.empresa_id = p_empresa_id AND f.evento = r.evento
        AND f.ativo AND f.versao_publicada IS NOT NULL AND f.arquivado_em IS NULL
    ) x ON true
    WHERE p_evento IS NULL OR r.evento = p_evento);
END;
$function$;

CREATE OR REPLACE FUNCTION public.integracao_retorno_importacao_iniciar(p_tenant_id uuid, p_empresa_id uuid, p_evento text, p_parametros jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'integracao'
AS $function$
DECLARE
  r         integracao.retorno_importacao_recurso;
  f         integracao.retorno_fluxo;
  v_usuario uuid;
  v_valor   text;
  v_param   jsonb;
  v_qt      int;
  v_val     jsonb;
  v_gat     jsonb;
  v_imp     uuid;
  v_ctx     jsonb;
  v_ok      boolean;
  v_id      uuid;
  v_status  text;
BEGIN
  SELECT * INTO r FROM integracao.retorno_importacao_recurso WHERE evento = p_evento;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RETORNO_IMPORTACAO_EVENTO_INVALIDO: %', p_evento USING ERRCODE = '22023';
  END IF;
  v_usuario := integracao.fn_retorno_importacao_autorizar(p_tenant_id, p_empresa_id, r.modulo, 'CREATE');

  v_param := CASE WHEN jsonb_typeof(p_parametros) = 'object' THEN p_parametros ELSE '{}'::jsonb END;
  v_valor := btrim(v_param->>'valor');
  IF coalesce(v_valor, '') = '' OR length(v_valor) > 200 THEN
    RAISE EXCEPTION 'RETORNO_IMPORTACAO_VALOR: informe o código a buscar (até 200 caracteres)' USING ERRCODE = '22023';
  END IF;
  v_param := v_param || jsonb_build_object('valor', v_valor);

  SELECT count(*) INTO v_qt FROM integracao.retorno_fluxo x
   WHERE x.tenant_id = p_tenant_id AND x.empresa_id = p_empresa_id AND x.evento = p_evento
     AND x.ativo AND x.versao_publicada IS NOT NULL AND x.arquivado_em IS NULL;
  IF v_qt = 0 THEN
    RAISE EXCEPTION 'RETORNO_IMPORTACAO_SEM_FLUXO: nenhum fluxo ativo para %', p_evento USING ERRCODE = '22023';
  ELSIF v_qt > 1 THEN
    RAISE EXCEPTION 'RETORNO_IMPORTACAO_AMBIGUA: % fluxos ativos para %; deixe só um ativo', v_qt, p_evento USING ERRCODE = '22023';
  END IF;
  SELECT * INTO f FROM integracao.retorno_fluxo x
   WHERE x.tenant_id = p_tenant_id AND x.empresa_id = p_empresa_id AND x.evento = p_evento
     AND x.ativo AND x.versao_publicada IS NOT NULL AND x.arquivado_em IS NULL;

  v_val := integracao.fn_retorno_validar_definicao(f.definicao_publicada, f.tenant_id, f.empresa_id);
  IF NOT (v_val->>'valido')::boolean THEN
    RAISE EXCEPTION 'RETORNO_FLUXO_INVALIDO: %', v_val->'erros' USING ERRCODE = '22023', DETAIL = v_val::text;
  END IF;

  INSERT INTO integracao.retorno_importacao (tenant_id, empresa_id, evento, fluxo_id, valor, parametros, teste, usuario_id, created_by)
  VALUES (p_tenant_id, p_empresa_id, p_evento, f.id, v_valor, v_param, false, v_usuario, v_usuario)
  RETURNING id INTO v_imp;

  v_ctx := integracao.fn_retorno_contexto('cadastro_importacao', v_imp, p_evento, NULL);
  v_gat := integracao.fn_retorno_no_gatilho(f.definicao_publicada);
  v_ok  := integracao.fn_retorno_avaliar_filtros(v_ctx, v_gat #> '{config,filtros}', v_gat #>> '{config,combinador}');
  v_status := CASE WHEN v_ok THEN 'pendente' ELSE 'filtrado' END;

  INSERT INTO integracao.retorno_execucao (tenant_id, empresa_id, fluxo_id, fluxo_versao, evento, entidade,
    documento_id, documento_numero, chave_ordenacao, contexto, modo, status, proximo_no, finalizado_em, erro, disparado_por)
  VALUES (f.tenant_id, f.empresa_id, f.id, f.versao_publicada, p_evento, 'cadastro_importacao',
    v_imp, left(v_valor, 100), 'importacao:' || v_imp, v_ctx, 'interativo', v_status, v_gat->>'id',
    CASE WHEN NOT v_ok THEN now() END, CASE WHEN NOT v_ok THEN 'Barrado pelos filtros do gatilho' END,
    'user:' || coalesce(v_usuario::text, 'suporte'))
  RETURNING id INTO v_id;

  UPDATE integracao.retorno_importacao SET execucao_id = v_id WHERE id = v_imp;

  RETURN jsonb_build_object('execucao_id', v_id, 'importacao_id', v_imp, 'status', v_status,
                            'fluxo_id', f.id, 'fluxo_nome', f.nome,
                            'tem_confirmacao', EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(f.definicao_publicada->'nos', '[]'::jsonb)) n
                                                       WHERE n->>'tipo' = 'logica.confirmar_usuario'));
END;
$function$;

CREATE OR REPLACE FUNCTION public.integracao_retorno_importacao_obter(p_execucao_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'integracao'
AS $function$
DECLARE e integracao.retorno_execucao;
BEGIN
  e := integracao.fn_retorno_importacao_execucao(p_execucao_id, false);
  RETURN integracao.fn_retorno_importacao_json(e);
END;
$function$;

CREATE OR REPLACE FUNCTION public.integracao_retorno_importacao_confirmar(p_execucao_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'integracao'
AS $function$
DECLARE e integracao.retorno_execucao;
BEGIN
  e := integracao.fn_retorno_importacao_execucao(p_execucao_id, true);
  IF e.status <> 'aguardando_confirmacao' THEN
    RAISE EXCEPTION 'RETORNO_IMPORTACAO_SEM_PREVIA: a importação não está aguardando confirmação (status %)', e.status USING ERRCODE = '22023';
  END IF;
  IF e.processar_apos < now() THEN
    RAISE EXCEPTION 'RETORNO_IMPORTACAO_PREVIA_EXPIRADA' USING ERRCODE = '22023';
  END IF;
  UPDATE integracao.retorno_execucao SET
    status = 'pendente',
    processar_apos = now(),
    estado = jsonb_set(coalesce(estado, '{}'::jsonb), '{confirmados}',
                       coalesce(estado->'confirmados', '{}'::jsonb) || jsonb_build_object(proximo_no, true))
  WHERE id = e.id RETURNING * INTO e;
  RETURN integracao.fn_retorno_importacao_json(e);
END;
$function$;

CREATE OR REPLACE FUNCTION public.integracao_retorno_importacao_cancelar(p_execucao_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'integracao'
AS $function$
DECLARE e integracao.retorno_execucao;
BEGIN
  e := integracao.fn_retorno_importacao_execucao(p_execucao_id, true);
  IF e.status IN ('aguardando_confirmacao', 'pendente') THEN
    UPDATE integracao.retorno_execucao SET
      status = 'descartado', finalizado_em = now(), reservado_ate = NULL,
      erro = 'Cancelado pelo usuário'
    WHERE id = e.id RETURNING * INTO e;
  END IF;
  RETURN integracao.fn_retorno_importacao_json(e);
END;
$function$;

-- Teste do editor: roda o fluxo de importação com um valor digitado (teste = busca de verdade no ERP,
-- sem gravar; simulação = nada sai). O front chama o retorno-dispatcher acao=executar.
CREATE OR REPLACE FUNCTION public.integracao_retorno_importacao_testar(p_fluxo_id uuid, p_parametros jsonb, p_modo text DEFAULT 'teste', p_usar_rascunho boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'integracao'
AS $function$
DECLARE
  f         integracao.retorno_fluxo;
  v_usuario uuid;
  v_def     jsonb;
  v_val     jsonb;
  v_evento  text;
  v_valor   text;
  v_param   jsonb;
  v_imp     uuid;
  v_ctx     jsonb;
  v_gat     jsonb;
  v_ok      boolean;
  v_id      uuid;
  v_status  text;
BEGIN
  IF p_modo NOT IN ('teste', 'simulacao') THEN
    RAISE EXCEPTION 'RETORNO_MODO_INVALIDO' USING ERRCODE = '22023';
  END IF;
  f := integracao.fn_retorno_fluxo_autorizado(p_fluxo_id, CASE WHEN p_modo = 'simulacao' THEN 'READ' ELSE 'UPDATE' END);
  v_usuario := integracao.fn_retorno_autorizar(f.tenant_id, f.empresa_id, CASE WHEN p_modo = 'simulacao' THEN 'READ' ELSE 'UPDATE' END);
  v_def := CASE WHEN p_usar_rascunho THEN f.definicao_rascunho ELSE f.definicao_publicada END;
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'RETORNO_FLUXO_NAO_PUBLICADO' USING ERRCODE = '22023';
  END IF;
  v_val := integracao.fn_retorno_validar_definicao(v_def, f.tenant_id, f.empresa_id);
  IF NOT (v_val->>'valido')::boolean THEN
    RAISE EXCEPTION 'RETORNO_FLUXO_INVALIDO: %', v_val->'erros' USING ERRCODE = '22023', DETAIL = v_val::text;
  END IF;
  v_evento := v_val #>> '{gatilho,evento}';
  IF NOT EXISTS (SELECT 1 FROM integracao.retorno_importacao_recurso r WHERE r.evento = v_evento) THEN
    RAISE EXCEPTION 'RETORNO_IMPORTACAO_EVENTO_INVALIDO: o gatilho do fluxo não é um botão Importar do ERP' USING ERRCODE = '22023';
  END IF;

  v_param := CASE WHEN jsonb_typeof(p_parametros) = 'object' THEN p_parametros ELSE '{}'::jsonb END;
  v_valor := btrim(v_param->>'valor');
  IF coalesce(v_valor, '') = '' OR length(v_valor) > 200 THEN
    RAISE EXCEPTION 'RETORNO_IMPORTACAO_VALOR: informe o código a buscar (até 200 caracteres)' USING ERRCODE = '22023';
  END IF;
  v_param := v_param || jsonb_build_object('valor', v_valor);

  INSERT INTO integracao.retorno_importacao (tenant_id, empresa_id, evento, fluxo_id, valor, parametros, teste, usuario_id, created_by)
  VALUES (f.tenant_id, f.empresa_id, v_evento, f.id, v_valor, v_param, true, v_usuario, v_usuario)
  RETURNING id INTO v_imp;

  v_ctx := integracao.fn_retorno_contexto('cadastro_importacao', v_imp, v_evento, NULL);
  v_gat := integracao.fn_retorno_no_gatilho(v_def);
  v_ok  := integracao.fn_retorno_avaliar_filtros(v_ctx, v_gat #> '{config,filtros}', v_gat #>> '{config,combinador}');
  v_status := CASE WHEN v_ok THEN 'pendente' ELSE 'filtrado' END;

  INSERT INTO integracao.retorno_execucao (tenant_id, empresa_id, fluxo_id, fluxo_versao, definicao_teste, evento, entidade,
    documento_id, documento_numero, chave_ordenacao, contexto, modo, status, proximo_no, finalizado_em, erro, disparado_por)
  VALUES (f.tenant_id, f.empresa_id, f.id, CASE WHEN p_usar_rascunho THEN NULL ELSE f.versao_publicada END,
    CASE WHEN p_usar_rascunho THEN v_def END, v_evento, 'cadastro_importacao',
    v_imp, left(v_valor, 100), p_modo || ':' || gen_random_uuid(), v_ctx, p_modo, v_status, v_gat->>'id',
    CASE WHEN NOT v_ok THEN now() END, CASE WHEN NOT v_ok THEN 'Barrado pelos filtros do gatilho' END,
    'user:' || coalesce(v_usuario::text, 'suporte'))
  RETURNING id INTO v_id;

  UPDATE integracao.retorno_importacao SET execucao_id = v_id WHERE id = v_imp;
  RETURN jsonb_build_object('execucao_id', v_id, 'importacao_id', v_imp, 'status', v_status, 'modo', p_modo, 'evento', v_evento);
END;
$function$;

REVOKE ALL ON FUNCTION public.integracao_retorno_importacao_disponivel(uuid, uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.integracao_retorno_importacao_iniciar(uuid, uuid, text, jsonb) FROM public, anon;
REVOKE ALL ON FUNCTION public.integracao_retorno_importacao_obter(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.integracao_retorno_importacao_confirmar(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.integracao_retorno_importacao_cancelar(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.integracao_retorno_importacao_testar(uuid, jsonb, text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.integracao_retorno_importacao_disponivel(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.integracao_retorno_importacao_iniciar(uuid, uuid, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.integracao_retorno_importacao_obter(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.integracao_retorno_importacao_confirmar(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.integracao_retorno_importacao_cancelar(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.integracao_retorno_importacao_testar(uuid, jsonb, text, boolean) TO authenticated, service_role;

-- ---------- 7. serviço (só retorno-dispatcher / service_role) ----------
CREATE OR REPLACE FUNCTION public.integracao_retorno_svc_chave_api(p_execucao_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'integracao'
AS $function$
DECLARE e integracao.retorno_execucao; v_prov text; c record;
BEGIN
  SELECT * INTO e FROM integracao.retorno_execucao WHERE id = p_execucao_id;
  IF NOT FOUND OR e.entidade <> 'cadastro_importacao' OR e.modo IN ('teste', 'simulacao') THEN
    RETURN NULL;
  END IF;
  SELECT f.erp_provedor_id INTO v_prov FROM integracao.retorno_fluxo f WHERE f.id = e.fluxo_id;
  SELECT ec.id, ec.webhook_secret INTO c
    FROM integracao.erp_conexao ec
   WHERE ec.tenant_id = e.tenant_id AND ec.empresa_id = e.empresa_id
     AND ec.ativo AND ec.webhook_ativo AND coalesce(ec.webhook_secret, '') <> ''
   ORDER BY (ec.erp_provedor_id = v_prov) DESC NULLS LAST, ec.webhook_ultimo_uso_em DESC NULLS LAST, ec.updated_at DESC NULLS LAST
   LIMIT 1;
  IF c.id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('conexao_id', c.id, 'chave', c.webhook_secret);
END;
$function$;

CREATE OR REPLACE FUNCTION public.integracao_retorno_svc_importacao_registrar(p_execucao_id uuid, p_resposta jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'integracao'
AS $function$
DECLARE v_id text := coalesce(p_resposta->>'id', p_resposta->>'id_wms', p_resposta->>'documento_id');
BEGIN
  UPDATE integracao.retorno_importacao i SET
    registro_id = CASE WHEN v_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN v_id::uuid END,
    registro_status = left(p_resposta->>'status', 60),
    resposta = p_resposta,
    gravado_em = now()
  FROM integracao.retorno_execucao e
  WHERE e.id = p_execucao_id AND e.entidade = 'cadastro_importacao' AND i.id = e.documento_id
    AND e.modo NOT IN ('teste', 'simulacao');
END;
$function$;

REVOKE ALL ON FUNCTION public.integracao_retorno_svc_chave_api(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.integracao_retorno_svc_importacao_registrar(uuid, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.integracao_retorno_svc_chave_api(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.integracao_retorno_svc_importacao_registrar(uuid, jsonb) TO service_role;

-- ---------- 8. validação dos fluxos ----------
CREATE OR REPLACE FUNCTION integracao.fn_retorno_validar_extensoes(p_def jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'integracao'
AS $function$
DECLARE
  v_erros  jsonb := '[]'::jsonb;
  v_avisos jsonb := '[]'::jsonb;
  v_nos    jsonb;
  v_lig    jsonb;
  v_gat    jsonb;
  v_ent    text;
  v_imp    boolean;
  v_grav   text;
  v_conf   text;
  r        record;
BEGIN
  IF p_def IS NULL OR jsonb_typeof(p_def) <> 'object' THEN
    RETURN jsonb_build_object('erros', v_erros, 'avisos', v_avisos);
  END IF;
  v_nos := CASE WHEN jsonb_typeof(p_def->'nos') = 'array' THEN p_def->'nos' ELSE '[]'::jsonb END;
  v_lig := CASE WHEN jsonb_typeof(p_def->'ligacoes') = 'array' THEN p_def->'ligacoes' ELSE '[]'::jsonb END;
  v_gat := fn_retorno_no_gatilho(p_def);
  IF v_gat->>'tipo' = 'gatilho.evento' THEN
    SELECT c.entidade INTO v_ent FROM retorno_evento_catalogo c WHERE c.codigo = v_gat #>> '{config,evento}';
  END IF;
  v_imp := v_ent = 'cadastro_importacao';

  FOR r IN SELECT n->>'id' AS id, n->>'tipo' AS tipo, coalesce(n->'config', '{}'::jsonb) AS cfg FROM jsonb_array_elements(v_nos) n LOOP
    IF r.tipo IN ('acao.gravar_logitrack', 'logica.confirmar_usuario') AND NOT coalesce(v_imp, false) THEN
      v_erros := v_erros || jsonb_build_object('codigo', 'NO_SO_IMPORTACAO', 'no_id', r.id,
        'mensagem', 'Este nó só pode ser usado com os eventos "Importar do ERP".');
    END IF;
    IF r.tipo = 'acao.gravar_logitrack' AND r.cfg ? 'corpo_de'
       AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_nos) n2 WHERE n2->>'id' = r.cfg->>'corpo_de' AND n2->>'tipo' = 'dados.payload') THEN
      v_erros := v_erros || jsonb_build_object('codigo', 'CORPO_DE_INVALIDO', 'no_id', r.id,
        'mensagem', '"corpo_de" deve apontar para um nó Montar payload.');
    END IF;
    IF r.tipo = 'logica.confirmar_usuario' THEN
      IF r.cfg ? 'expira_minutos' AND NOT coalesce((r.cfg->>'expira_minutos')::numeric, 0) BETWEEN 1 AND 60 THEN
        v_erros := v_erros || jsonb_build_object('codigo', 'CONFIRMAR_INVALIDO', 'no_id', r.id,
          'mensagem', 'A prévia expira entre 1 e 60 minutos.');
      END IF;
      IF coalesce(r.cfg->>'previa_de', '') <> ''
         AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_nos) n2 WHERE n2->>'id' = r.cfg->>'previa_de'
                         AND n2->>'tipo' IN ('dados.payload', 'acao.http', 'acao.webhook', 'acao.provedor')) THEN
        v_erros := v_erros || jsonb_build_object('codigo', 'CONFIRMAR_INVALIDO', 'no_id', r.id,
          'mensagem', '"previa_de" deve apontar para um nó Montar payload ou Requisição HTTP.');
      END IF;
    END IF;
    IF coalesce(v_imp, false) AND r.tipo = 'logica.aguardar' THEN
      v_erros := v_erros || jsonb_build_object('codigo', 'IMPORTACAO_SEM_AGUARDAR', 'no_id', r.id,
        'mensagem', 'O botão Importar do ERP roda com o usuário esperando: o nó Aguardar não pode ser usado.');
    END IF;
    IF coalesce(v_imp, false) AND r.tipo = 'acao.atualizar_documento' THEN
      v_avisos := v_avisos || jsonb_build_object('codigo', 'IMPORTACAO_SEM_DOCUMENTO', 'no_id', r.id,
        'mensagem', 'Na importação não há documento para atualizar: este nó não terá efeito.');
    END IF;
  END LOOP;

  IF coalesce(v_imp, false) THEN
    IF coalesce(v_gat #>> '{config,modo}', 'imediato') <> 'imediato' THEN
      v_erros := v_erros || jsonb_build_object('codigo', 'IMPORTACAO_MODO', 'no_id', v_gat->>'id',
        'mensagem', 'O botão Importar do ERP roda na hora: use o modo imediato.');
    END IF;
    IF (SELECT count(*) FROM jsonb_array_elements(v_nos) n WHERE n->>'tipo' = 'acao.gravar_logitrack') <> 1 THEN
      v_erros := v_erros || jsonb_build_object('codigo', 'IMPORTACAO_GRAVAR_UNICO',
        'mensagem', 'O fluxo de importação precisa de exatamente um nó "Gravar no LogiTrack".');
    END IF;
    IF (SELECT count(*) FROM jsonb_array_elements(v_nos) n WHERE n->>'tipo' = 'logica.confirmar_usuario') > 1 THEN
      v_erros := v_erros || jsonb_build_object('codigo', 'IMPORTACAO_CONFIRMAR_UNICO',
        'mensagem', 'Use no máximo um nó "Confirmar com o usuário".');
    END IF;
    SELECT n->>'id' INTO v_grav FROM jsonb_array_elements(v_nos) n WHERE n->>'tipo' = 'acao.gravar_logitrack' LIMIT 1;
    SELECT n->>'id' INTO v_conf FROM jsonb_array_elements(v_nos) n WHERE n->>'tipo' = 'logica.confirmar_usuario' LIMIT 1;
    IF v_grav IS NOT NULL AND v_conf IS NOT NULL AND NOT EXISTS (
      WITH RECURSIVE e AS (SELECT l->>'de' AS de, l->>'para' AS para FROM jsonb_array_elements(v_lig) l),
      alc(id, prof) AS (SELECT v_conf, 0 UNION SELECT e.para, alc.prof + 1 FROM alc JOIN e ON e.de = alc.id WHERE alc.prof < 25)
      SELECT 1 FROM alc WHERE alc.id = v_grav) THEN
      v_erros := v_erros || jsonb_build_object('codigo', 'IMPORTACAO_CONFIRMAR_DEPOIS', 'no_id', v_conf,
        'mensagem', 'O nó "Confirmar com o usuário" precisa vir antes do "Gravar no LogiTrack".');
    END IF;
  END IF;

  RETURN jsonb_build_object('erros', v_erros, 'avisos', v_avisos);
END;
$function$;
REVOKE ALL ON FUNCTION integracao.fn_retorno_validar_extensoes(jsonb) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION integracao.fn_retorno_validar_definicao(p_def jsonb, p_tenant_id uuid, p_empresa_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'integracao'
AS $function$
DECLARE
  v   jsonb;
  ref jsonb;
  ext jsonb;
BEGIN
  v := integracao.fn_retorno_validar_definicao_base(p_def, p_tenant_id, p_empresa_id);
  IF p_def IS NULL OR jsonb_typeof(p_def) <> 'object' THEN
    RETURN v;
  END IF;
  ref := integracao.fn_retorno_validar_referencias(p_def);
  ext := integracao.fn_retorno_validar_extensoes(p_def);
  v := jsonb_set(v, '{erros}',  coalesce(v->'erros',  '[]'::jsonb) || coalesce(ref->'erros',  '[]'::jsonb) || coalesce(ext->'erros',  '[]'::jsonb));
  v := jsonb_set(v, '{avisos}', coalesce(v->'avisos', '[]'::jsonb) || coalesce(ref->'avisos', '[]'::jsonb) || coalesce(ext->'avisos', '[]'::jsonb));
  v := jsonb_set(v, '{valido}', to_jsonb(jsonb_array_length(v->'erros') = 0));
  RETURN v;
END;
$function$;

-- "Gravar no LogiTrack" grava a resposta da API em saidas.<id>: entra na lista de nós que geram saída.
-- A função em produção é mais nova que a do QA (limites via fn_retorno_limites): em vez de recriá-la,
-- este bloco altera só a lista de "produtores" e a mensagem na versão que estiver no banco.
DO $patch$
DECLARE v_def text; v_novo text;
BEGIN
  v_def := pg_get_functiondef('integracao.fn_retorno_validar_referencias(jsonb)'::regprocedure);
  IF position('acao.gravar_logitrack' IN v_def) > 0 THEN RETURN; END IF;
  v_novo := replace(v_def, $a$'acao.provedor'];$a$, $a$'acao.provedor', 'acao.gravar_logitrack'];$a$);
  v_novo := replace(v_novo, 'Webhook e Ação do ERP geram.', 'Webhook, Ação do ERP e Gravar no LogiTrack geram.');
  IF position('acao.gravar_logitrack' IN v_novo) = 0 THEN
    RAISE EXCEPTION 'RETORNO_MIGRACAO: lista de nós que geram saída não encontrada em fn_retorno_validar_referencias';
  END IF;
  EXECUTE v_novo;
END
$patch$;
