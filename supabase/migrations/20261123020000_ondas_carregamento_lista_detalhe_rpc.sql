-- =====================================================================
-- Ondas de Carregamento · lista e detalhe numa chamada cada (performance web).
--
-- Antes: a lista disparava até 11 consultas em 6 ondas em série (listar +
-- pendências + aguardando NF + tipo de saída + integração + 5 consultas
-- encadeadas para os operadores) e o clique na onda 4 consultas (itens + 3 views).
-- O banco respondia cada uma em 4–25 ms; o tempo era viagem de rede.
--
-- rpc_ondas_carregamento_lista(<filtros de listar_ondas_carregamento>)
--   Embrulha listar_ondas_carregamento (mesmos filtros, paginação e ordem — nada
--   duplicado) e acrescenta por onda:
--     tipo_saida_descricao  do PRÓPRIO movimento (movimento_saida.tipo_saida),
--                           não do 1º documento vinculado (decisão do produto)
--     integracao_resumo     coluna calculada no banco (S1)
--     operadores            jsonb [{nome, codigo, ativo}] — quem está com tarefa
--                           aberta (ativo) e quem já executou; o front monta os
--                           rótulos com montarRotulosOperadores/siglaEtapa
--     docs_sem_nf           conferencia_ondas_aguardando_nf (SEPARADO/EM_CONFERENCIA)
--     qtd_sem_saldo         nº de linhas de rpc_onda_pendencias_picking (LIBERADO/EM_PICKING)
--
-- rpc_onda_carregamento_detalhe(p_movimento_id, p_secao)
--   itens        cabeçalho atual + buscar_itens_onda_carregamento + pendências de
--                saldo da onda (chips) + contagens das outras abas
--   separacao    vw_movimento_saida_separacao_detalhe
--   conferencia  vw_movimento_saida_conferencia_detalhe
--   informacoes  vw_movimento_saida_docs_vinculados
--   As regras continuam nas funções/views existentes; aqui só se junta tudo numa
--   chamada, depois de validar que a onda é do tenant do JWT.
--
-- SECURITY DEFINER: tenant vem só do JWT (get_current_tenant) e é filtrado
-- explicitamente. Erros {codigo, mensagem} (RAISE P0001) lidos pelo errorMapper.
-- Aditiva: nada existente é alterado.
-- Reversão: supabase/rollback/20261123_ondas_carregamento_lista_detalhe_reverter.sql
-- =====================================================================

create or replace function public.rpc_ondas_carregamento_lista(
  p_empresa_id          uuid    default null,
  p_status              text    default null,
  p_data_de             date    default null,
  p_data_ate            date    default null,
  p_numero_onda         bigint  default null,
  p_numero_documento    bigint  default null,
  p_tipo_saida_id       uuid    default null,
  p_parceiro_codigo_erp text    default null,
  p_vendedor            text    default null,
  p_transportador       text    default null,
  p_page                integer default 1,
  p_page_size           integer default 50,
  p_sku                 text    default null,
  p_numero_nf           text    default null
)
returns table (
  id                   uuid,
  numero_onda          bigint,
  status               text,
  prioridade           text,
  data_emissao         timestamp without time zone,
  parceiro_nome        text,
  operador_nome        text,
  box_descricao        text,
  rota_descricao       text,
  veiculo_placa        text,
  motorista            text,
  total_pedidos        integer,
  total_itens          bigint,
  total_esperado       numeric,
  total_separado       numeric,
  total_conferido      numeric,
  total_cortado        numeric,
  total_registros      bigint,
  tipo_saida_descricao text,
  integracao_resumo    text,
  operadores           jsonb,
  docs_sem_nf          integer,
  qtd_sem_saldo        integer
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_tenant uuid := public.get_current_tenant();
begin
  if v_tenant is null then
    raise exception using errcode = 'P0001', message = jsonb_build_object(
      'codigo', 'SESSAO_SEM_TENANT',
      'mensagem', 'Sessão sem empresa válida. Entre novamente.')::text;
  end if;

  return query
  with base as materialized (
    select l.*
      from public.listar_ondas_carregamento(
             v_tenant, p_empresa_id, p_status, p_data_de, p_data_ate, p_numero_onda,
             p_numero_documento, p_tipo_saida_id, p_parceiro_codigo_erp, p_vendedor,
             p_transportador, p_page, p_page_size, p_sku, p_numero_nf) l
  ),
  pend as (
    select pp.movimento_saida_id, count(*)::integer as n
      from public.rpc_onda_pendencias_picking(
             v_tenant,
             coalesce((select array_agg(b.id) from base b where b.status in ('LIBERADO', 'EM_PICKING')), '{}'::uuid[])
           ) pp
     group by pp.movimento_saida_id
  ),
  nf as (
    select a.movimento_saida_id, a.docs_sem_nf
      from public.conferencia_ondas_aguardando_nf(
             v_tenant,
             coalesce((select array_agg(b.id) from base b where b.status in ('SEPARADO', 'EM_CONFERENCIA')), '{}'::uuid[])
           ) a
  )
  select b.id, b.numero_onda, b.status, b.prioridade, b.data_emissao, b.parceiro_nome,
         b.operador_nome, b.box_descricao, b.rota_descricao, b.veiculo_placa, b.motorista,
         b.total_pedidos, b.total_itens, b.total_esperado, b.total_separado,
         b.total_conferido, b.total_cortado, b.total_registros,
         ts.descricao                          as tipo_saida_descricao,
         ms.integracao_resumo,
         coalesce(ops.operadores, '[]'::jsonb) as operadores,
         nf.docs_sem_nf,
         coalesce(pend.n, 0)                   as qtd_sem_saldo
    from base b
    join public.movimento_saida ms
      on ms.id = b.id
     and ms.tenant_id = v_tenant
    left join public.tipo_saida ts
      on ts.id = ms.tipo_saida
     and ts.tenant_id = v_tenant
    left join pend on pend.movimento_saida_id = b.id
    left join nf   on nf.movimento_saida_id = b.id
    left join lateral (
      select jsonb_agg(distinct jsonb_build_object('nome', x.nome, 'codigo', x.codigo, 'ativo', x.ativo)) as operadores
        from (
          -- quem está com a tarefa agora (atribuição aberta em tarefa aberta)
          select u.nome, tt.codigo, true as ativo
            from public.movimento_saida_item msi
            join public.tarefa t
              on t.id_documento_origem = msi.id
             and t.tipo_documento_origem = 'MOVIMENTO_SAIDA_ITEM'
             and t.tenant_id = v_tenant
             and t.status in ('CRIADA', 'ATRIBUIDA', 'EM_ANDAMENTO', 'PAUSADA')
            join public.tarefa_atribuicao ta
              on ta.tarefa_id = t.id
             and ta.tenant_id = v_tenant
             and ta.liberado_em is null
            join public.usuario u
              on u.id = ta.usuario_id
             and u.tenant_id = v_tenant
            left join public.tipo_tarefa tt
              on tt.id = t.tipo_tarefa_id
           where msi.movimento_saida_id = b.id
             and msi.tenant_id = v_tenant
          union
          -- quem já executou alguma tarefa da onda (histórico)
          select u.nome, tt.codigo, false as ativo
            from public.movimento_saida_item msi
            join public.tarefa t
              on t.id_documento_origem = msi.id
             and t.tipo_documento_origem = 'MOVIMENTO_SAIDA_ITEM'
             and t.tenant_id = v_tenant
             and t.status <> 'CANCELADA'
            join public.tarefa_execucao te
              on te.tarefa_id = t.id
             and te.tenant_id = v_tenant
            join public.usuario u
              on u.id = te.usuario_id
             and u.tenant_id = v_tenant
            left join public.tipo_tarefa tt
              on tt.id = t.tipo_tarefa_id
           where msi.movimento_saida_id = b.id
             and msi.tenant_id = v_tenant
        ) x
    ) ops on true
   order by b.numero_onda desc;
end;
$$;

comment on function public.rpc_ondas_carregamento_lista(uuid, text, date, date, bigint, bigint, uuid, text, text, text, integer, integer, text, text) is
  'Lista de Ondas de Carregamento (filtros de listar_ondas_carregamento) com tipo de saída do movimento, integração, operadores, aguardando NF e sem saldo numa chamada. Tenant do JWT.';

revoke all on function public.rpc_ondas_carregamento_lista(uuid, text, date, date, bigint, bigint, uuid, text, text, text, integer, integer, text, text) from public;
revoke all on function public.rpc_ondas_carregamento_lista(uuid, text, date, date, bigint, bigint, uuid, text, text, text, integer, integer, text, text) from anon;
grant execute on function public.rpc_ondas_carregamento_lista(uuid, text, date, date, bigint, bigint, uuid, text, text, text, integer, integer, text, text) to authenticated;
grant execute on function public.rpc_ondas_carregamento_lista(uuid, text, date, date, bigint, bigint, uuid, text, text, text, integer, integer, text, text) to service_role;


create or replace function public.rpc_onda_carregamento_detalhe(
  p_movimento_id uuid,
  p_secao        text default 'itens'
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_tenant uuid := public.get_current_tenant();
  v_mov    public.movimento_saida%rowtype;
  v_secao  text := lower(coalesce(nullif(btrim(p_secao), ''), 'itens'));
  v_dados  jsonb;
begin
  if v_tenant is null then
    raise exception using errcode = 'P0001', message = jsonb_build_object(
      'codigo', 'SESSAO_SEM_TENANT',
      'mensagem', 'Sessão sem empresa válida. Entre novamente.')::text;
  end if;

  if v_secao not in ('itens', 'separacao', 'conferencia', 'informacoes') then
    raise exception using errcode = 'P0001', message = jsonb_build_object(
      'codigo', 'SECAO_INVALIDA',
      'mensagem', 'Seção do detalhe inválida: ' || coalesce(p_secao, '(vazia)'))::text;
  end if;

  select * into v_mov
    from movimento_saida ms
   where ms.id = p_movimento_id
     and ms.tenant_id = v_tenant;
  if not found then
    raise exception using errcode = 'P0001', message = jsonb_build_object(
      'codigo', 'ONDA_NAO_ENCONTRADA',
      'mensagem', 'Onda de carregamento não encontrada. Ela pode ter sido cancelada ou removida.')::text;
  end if;

  -- As views abaixo rodam como dono da função (sem RLS). A onda já foi validada
  -- como do tenant, e todas as linhas filtradas pelo id dela pertencem a ela.

  if v_secao = 'itens' then
    select coalesce(jsonb_agg(to_jsonb(i) order by i.sku, i.id), '[]'::jsonb)
      into v_dados
      from public.buscar_itens_onda_carregamento(v_tenant, p_movimento_id) i;

    return jsonb_build_object(
      'cabecalho', jsonb_build_object(
        'movimento_id',         v_mov.id,
        'numero_onda',          v_mov.numero_onda,
        'status',               v_mov.status::text,
        'prioridade',           v_mov.prioridade::text,
        'integracao_resumo',    v_mov.integracao_resumo,
        'tipo_saida_descricao', (select ts.descricao from tipo_saida ts
                                  where ts.id = v_mov.tipo_saida and ts.tenant_id = v_tenant)
      ),
      'itens', v_dados,
      -- Mesmas condições da tela antiga: pendências só de onda liberada/em separação.
      'pendencias', case when v_mov.status::text in ('LIBERADO', 'EM_PICKING') then (
        select coalesce(jsonb_agg(to_jsonb(pp)), '[]'::jsonb)
          from public.rpc_onda_pendencias_picking(v_tenant, array[p_movimento_id]) pp
      ) else '[]'::jsonb end,
      'contagens', jsonb_build_object(
        'separacao',   (select count(*) from vw_movimento_saida_separacao_detalhe v where v.movimento_id = p_movimento_id),
        'conferencia', (select count(*) from vw_movimento_saida_conferencia_detalhe v where v.movimento_saida_id = p_movimento_id and v.tenant_id = v_tenant),
        'documentos',  (select count(*) from vw_movimento_saida_docs_vinculados v where v.movimento_saida_id = p_movimento_id and v.tenant_id = v_tenant)
      )
    );
  end if;

  if v_secao = 'separacao' then
    select coalesce(jsonb_agg(to_jsonb(v) order by v.concluido_em asc nulls last, v.tarefa_execucao_id), '[]'::jsonb)
      into v_dados
      from vw_movimento_saida_separacao_detalhe v
     where v.movimento_id = p_movimento_id;
    return jsonb_build_object('separacao', v_dados);
  end if;

  if v_secao = 'conferencia' then
    select coalesce(jsonb_agg(to_jsonb(v) order by v.concluido_em asc nulls last, v.sku), '[]'::jsonb)
      into v_dados
      from vw_movimento_saida_conferencia_detalhe v
     where v.movimento_saida_id = p_movimento_id
       and v.tenant_id = v_tenant;
    return jsonb_build_object('conferencia', v_dados);
  end if;

  select coalesce(jsonb_agg(to_jsonb(v) order by v.ordem, v.documento_saida_id), '[]'::jsonb)
    into v_dados
    from vw_movimento_saida_docs_vinculados v
   where v.movimento_saida_id = p_movimento_id
     and v.tenant_id = v_tenant;
  return jsonb_build_object('documentos', v_dados);
end;
$$;

comment on function public.rpc_onda_carregamento_detalhe(uuid, text) is
  'Detalhe da onda de carregamento por aba (itens | separacao | conferencia | informacoes) numa chamada só. Tenant do JWT.';

revoke all on function public.rpc_onda_carregamento_detalhe(uuid, text) from public;
revoke all on function public.rpc_onda_carregamento_detalhe(uuid, text) from anon;
grant execute on function public.rpc_onda_carregamento_detalhe(uuid, text) to authenticated;
grant execute on function public.rpc_onda_carregamento_detalhe(uuid, text) to service_role;
