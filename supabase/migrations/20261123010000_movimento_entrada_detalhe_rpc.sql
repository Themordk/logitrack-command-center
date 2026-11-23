-- =====================================================================
-- Movimento de Entrada · detalhe numa chamada só (performance da tela web).
--
-- Antes, clicar num movimento disparava 8 consultas em 3 ondas em série
-- (buscar_itens_movimento_entrada → movimento_entrada_item → picking_produto /
-- produto_embalagem, mais 4 views das outras abas). O banco respondia cada uma
-- em 2–25 ms; o tempo da tela era viagem de rede. Esta RPC devolve cada aba
-- num único jsonb:
--
--   p_secao = 'itens'        cabeçalho + itens com alertas (sem picking no
--                            armazém do movimento / sem EAN preenchido) +
--                            contagens das outras abas
--   p_secao = 'conferencia'  execuções de conferência (≠ CANCELADA)
--   p_secao = 'armazenagem'  execuções de armazenagem CONCLUIDA
--   p_secao = 'informacoes'  cabeçalho completo + documentos vinculados
--
-- SECURITY DEFINER (não passa pelo RLS linha a linha): o tenant vem só do JWT
-- (get_current_tenant) e TODO acesso filtra tenant_id explicitamente.
-- Erros no formato JSON {codigo, mensagem} (RAISE P0001), lidos pelo errorMapper.
--
-- Aditiva: buscar_itens_movimento_entrada e as views vw_movimento_entrada_*
-- continuam existindo para os outros consumidores.
-- Reversão: supabase/rollback/20261123_movimento_entrada_detalhe_reverter.sql
-- =====================================================================

create or replace function public.rpc_movimento_entrada_detalhe(
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
  v_tenant  uuid := public.get_current_tenant();
  v_mov     public.movimento_entrada%rowtype;
  v_tt_conf uuid;
  v_tt_armz uuid;
  v_secao   text := lower(coalesce(nullif(btrim(p_secao), ''), 'itens'));
  v_dados   jsonb;
begin
  if v_tenant is null then
    raise exception using errcode = 'P0001', message = jsonb_build_object(
      'codigo', 'SESSAO_SEM_TENANT',
      'mensagem', 'Sessão sem empresa válida. Entre novamente.')::text;
  end if;

  if v_secao not in ('itens', 'conferencia', 'armazenagem', 'informacoes') then
    raise exception using errcode = 'P0001', message = jsonb_build_object(
      'codigo', 'SECAO_INVALIDA',
      'mensagem', 'Seção do detalhe inválida: ' || coalesce(p_secao, '(vazia)'))::text;
  end if;

  select * into v_mov
    from movimento_entrada me
   where me.id = p_movimento_id
     and me.tenant_id = v_tenant;
  if not found then
    raise exception using errcode = 'P0001', message = jsonb_build_object(
      'codigo', 'MOVIMENTO_NAO_ENCONTRADO',
      'mensagem', 'Movimento de entrada não encontrado. Ele pode ter sido cancelado ou removido.')::text;
  end if;

  select tt.id into v_tt_conf from tipo_tarefa tt where tt.tenant_id = v_tenant and tt.codigo = 'ENTR-CONF';
  select tt.id into v_tt_armz from tipo_tarefa tt where tt.tenant_id = v_tenant and tt.codigo = 'ENTR-ARMZ';

  -- ------------------------------------------------------------------ itens
  if v_secao = 'itens' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.sku, x.movimento_item_id), '[]'::jsonb)
      into v_dados
      from (
        select mei.id                                   as movimento_item_id,
               p.sku,
               p.descricao,
               mei.qtd_esperada,
               coalesce(qc.qtd, 0)                      as qtd_conferida,
               coalesce(qa.qtd, 0)                      as qtd_armazenada,
               coalesce(mei.qtd_ocorrencia, 0)          as qtd_ocorrencia,
               mei.status_item_movimento::text          as status_item_movimento,
               (pk.achou is null)                       as sem_picking,
               (ean.achou is null)                      as sem_ean
          from movimento_entrada_item mei
          join produto p
            on p.id = mei.produto_id
           and p.tenant_id = v_tenant
          left join lateral (
            select sum(t.quantidade_executada) as qtd
              from tarefa t
             where t.id_documento_origem = mei.id
               and t.tipo_tarefa_id = v_tt_conf
               and t.tenant_id = v_tenant
          ) qc on true
          left join lateral (
            select sum(t.quantidade_executada) as qtd
              from tarefa t
             where t.id_documento_origem = mei.id
               and t.tipo_tarefa_id = v_tt_armz
               and t.tenant_id = v_tenant
          ) qa on true
          -- LATERAL + LIMIT 1: força uma busca por item no índice. Com NOT EXISTS
          -- o planejador trocava por um hash de TODO o picking do armazém
          -- (7 mil linhas no maior tenant, ~14 ms e crescendo).
          left join lateral (
            select 1 as achou
              from picking_produto pp
             where pp.tenant_id  = v_tenant
               and pp.armazem_id = v_mov.armazem_id
               and pp.produto_id = mei.produto_id
               and pp.ativo
             limit 1
          ) pk on true
          left join lateral (
            select 1 as achou
              from produto_embalagem pe
             where pe.produto_id = mei.produto_id
               and pe.tenant_id  = v_tenant
               and pe.ativo
               and pe.ean is not null
               and pe.ean <> ''
             limit 1
          ) ean on true
         where mei.tenant_id = v_tenant
           and mei.movimento_entrada_id = p_movimento_id
      ) x;

    return jsonb_build_object(
      'cabecalho', jsonb_build_object(
        'movimento_id',     v_mov.id,
        'numero_movimento', v_mov.numero_movimento,
        'status',           v_mov.status::text,
        'armazem_id',       v_mov.armazem_id
      ),
      'itens', v_dados,
      'contagens', jsonb_build_object(
        'conferencias', (
          select count(*)
            from tarefa_execucao te
            join tarefa t on t.id = te.tarefa_id
            join movimento_entrada_item mei on mei.id = t.id_documento_origem
           where mei.movimento_entrada_id = p_movimento_id
             and mei.tenant_id = v_tenant
             and t.tenant_id = v_tenant
             and te.tenant_id = v_tenant
             and t.tipo_tarefa_id = v_tt_conf
             and te.status <> 'CANCELADA'),
        'armazenagens', (
          select count(*)
            from tarefa_execucao te
            join tarefa t on t.id = te.tarefa_id
            join movimento_entrada_item mei on mei.id = t.id_documento_origem
           where mei.movimento_entrada_id = p_movimento_id
             and mei.tenant_id = v_tenant
             and t.tenant_id = v_tenant
             and te.tenant_id = v_tenant
             and t.tipo_tarefa_id = v_tt_armz
             and te.status = 'CONCLUIDA'),
        'documentos', (
          select count(*)
            from movimento_entrada_documento med
           where med.movimento_entrada_id = p_movimento_id
             and med.tenant_id = v_tenant)
      )
    );
  end if;

  -- ------------------------------------------------------------ conferencia
  if v_secao = 'conferencia' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.concluido_em asc nulls last, x.tarefa_execucao_id), '[]'::jsonb)
      into v_dados
      from (
        select te.id                      as tarefa_execucao_id,
               p.sku,
               p.descricao,
               u.nome                     as operador,
               h.codigo_hu,
               te.validade,
               te.fabricacao,
               te.serie,
               te.lote,
               te.quantidade_executada,
               te.iniciado_em,
               te.concluido_em,
               te.status::text            as status
          from movimento_entrada_item mei
          join tarefa t
            on t.id_documento_origem = mei.id
           and t.tipo_tarefa_id = v_tt_conf
           and t.tenant_id = v_tenant
          join tarefa_execucao te
            on te.tarefa_id = t.id
           and te.tenant_id = v_tenant
           and te.status <> 'CANCELADA'
          join usuario u
            on u.id = te.usuario_id
           and u.tenant_id = v_tenant
          join produto p
            on p.id = t.produto_id
           and p.tenant_id = v_tenant
          left join hu h
            on h.id = te.hu
           and h.tenant_id = v_tenant
         where mei.movimento_entrada_id = p_movimento_id
           and mei.tenant_id = v_tenant
      ) x;

    return jsonb_build_object('conferencia', v_dados);
  end if;

  -- ------------------------------------------------------------ armazenagem
  if v_secao = 'armazenagem' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.concluido_em asc nulls last, x.tarefa_execucao_id), '[]'::jsonb)
      into v_dados
      from (
        select te.id                      as tarefa_execucao_id,
               p.sku,
               p.descricao                as descricao_sku,
               u.login,
               h.codigo_hu,
               e.descricao                as endereco,
               te.quantidade_executada,
               te.lote,
               te.fabricacao,
               te.validade,
               te.iniciado_em,
               te.concluido_em
          from movimento_entrada_item mei
          join tarefa t
            on t.id_documento_origem = mei.id
           and t.tipo_tarefa_id = v_tt_armz
           and t.tenant_id = v_tenant
          join tarefa_execucao te
            on te.tarefa_id = t.id
           and te.tenant_id = v_tenant
           and te.status = 'CONCLUIDA'
          join usuario u
            on u.id = te.usuario_id
           and u.tenant_id = v_tenant
          left join produto p
            on p.id = t.produto_id
           and p.tenant_id = v_tenant
          left join endereco e
            on e.id = te.endereco_destino_id
           and e.tenant_id = v_tenant
          left join hu h
            on h.id = te.hu
           and h.tenant_id = v_tenant
         where mei.movimento_entrada_id = p_movimento_id
           and mei.tenant_id = v_tenant
      ) x;

    return jsonb_build_object('armazenagem', v_dados);
  end if;

  -- ------------------------------------------------------------ informacoes
  select coalesce(jsonb_agg(to_jsonb(x) order by x.numero_nota, x.documento_entrada_id), '[]'::jsonb)
    into v_dados
    from (
      select de.id               as documento_entrada_id,
             de.numero_nota,
             pa.razaosocial,
             de.valor_total_nota,
             de.qtd_volume,
             (select count(*)
                from documento_entrada_item dei
               where dei.documento_entrada_id = de.id
                 and dei.tenant_id = v_tenant) as total_skus
        from movimento_entrada_documento med
        join documento_entrada de
          on de.id = med.documento_entrada_id
         and de.tenant_id = v_tenant
        left join parceiro pa
          on pa.id = de.parceiro_id
         and pa.tenant_id = v_tenant
       where med.movimento_entrada_id = p_movimento_id
         and med.tenant_id = v_tenant
    ) x;

  return jsonb_build_object(
    'informacoes', jsonb_build_object(
      'movimento_id',           v_mov.id,
      'numero_movimento',       v_mov.numero_movimento,
      'status',                 v_mov.status::text,
      'created_at',             v_mov.created_at,
      'finalizado_em',          v_mov.finalizado_em,
      'tipo_entrada_descricao', (select te.descricao from tipo_entrada te
                                  where te.id = v_mov.tipo_entrada_id and te.tenant_id = v_tenant),
      'confirma_volume',        v_mov.confirma_volume,
      'total_volume',           v_mov.total_volume,
      'total_volume_conferido', v_mov.total_volume_conferido,
      'armazem_descricao',      (select a.descricao from armazem a
                                  where a.id = v_mov.armazem_id and a.tenant_id = v_tenant),
      'box_descricao',          (select b.descricao from box b
                                  where b.id = v_mov.box_id and b.tenant_id = v_tenant),
      'placa_veiculo',          v_mov.placa_veiculo,
      'valor_descarga',         v_mov.valor_descarga,
      'crossdocking',           v_mov.crossdocking,
      'observacao',             v_mov.observacao
    ),
    'documentos', v_dados
  );
end;
$$;

comment on function public.rpc_movimento_entrada_detalhe(uuid, text) is
  'Detalhe do movimento de entrada por aba (itens | conferencia | armazenagem | informacoes) numa chamada só. Tenant do JWT.';

revoke all on function public.rpc_movimento_entrada_detalhe(uuid, text) from public;
revoke all on function public.rpc_movimento_entrada_detalhe(uuid, text) from anon;
grant execute on function public.rpc_movimento_entrada_detalhe(uuid, text) to authenticated;
grant execute on function public.rpc_movimento_entrada_detalhe(uuid, text) to service_role;
