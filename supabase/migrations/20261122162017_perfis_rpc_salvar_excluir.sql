-- =====================================================================
-- Perfis de Acesso v2 (Fase 2): gravação atômica de perfil.
--
-- Antes a tela apagava todas as permissões do perfil e inseria de novo, em
-- chamadas separadas. Uma falha no meio deixava o perfil vazio e o usuário
-- caía no fallback de "sem permissões = acesso total" do frontend. Excluir um
-- perfil também apagava usuario_perfil, deixando usuários sem perfil.
--
-- rpc_perfil_salvar  : nome/descrição + permissões + menus ocultos, numa
--                      transação só, com validação de tenant e autobloqueio.
-- rpc_perfil_excluir : recusa perfil de sistema, de acesso total ou com
--                      usuários vinculados.
--
-- Erros no formato JSON {codigo, mensagem} (RAISE P0001), lidos pelo errorMapper.
-- =====================================================================

create or replace function public.rpc_perfil_salvar(
  p_perfil_id   uuid,
  p_nome        text,
  p_descricao   text,
  p_permissoes  uuid[],
  p_menus       jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_tenant    uuid := get_current_tenant();
  v_usuario   uuid;
  v_perfil    public.perfil%rowtype;
  v_tinha     boolean;
  v_pedidas   uuid[];
  v_validas   uuid[];
  v_item      jsonb;
  v_grupo     text;
begin
  select u.id into v_usuario
    from usuario u
   where u.auth_user_id = auth.uid() and u.tenant_id = v_tenant and u.ativo;

  if v_tenant is null or v_usuario is null or not (
       not exists (select 1 from usuario_perfil up where up.usuario_id = v_usuario)
       or exists (select 1 from usuario_perfil up join perfil pf on pf.id = up.perfil_id
                   where up.usuario_id = v_usuario and pf.acesso_total)
       or fn_usuario_tem_permissao(v_usuario, 'web.config.perfis', 'UPDATE')
     ) then
    raise exception using errcode = 'P0001', message = jsonb_build_object(
      'codigo', 'PERFIL_ACESSO_NEGADO',
      'mensagem', 'Você não tem permissão para editar perfis de acesso.')::text;
  end if;

  select * into v_perfil from perfil
   where id = p_perfil_id and tenant_id = v_tenant
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = jsonb_build_object(
      'codigo', 'PERFIL_NAO_ENCONTRADO', 'mensagem', 'Perfil não encontrado.')::text;
  end if;

  if coalesce(btrim(p_nome), '') = '' then
    raise exception using errcode = 'P0001', message = jsonb_build_object(
      'codigo', 'PERFIL_NOME_OBRIGATORIO', 'mensagem', 'Informe o nome do perfil.')::text;
  end if;

  v_tinha := fn_usuario_tem_permissao(v_usuario, 'web.config.perfis', 'UPDATE');

  -- Perfil de acesso total: só nome/descrição; recebe sempre todas as permissões
  if v_perfil.acesso_total then
    if exists (select 1 from jsonb_array_elements(coalesce(p_menus, '[]'::jsonb)) e
                where coalesce((e->>'visivel')::boolean, true) = false) then
      raise exception using errcode = 'P0001', message = jsonb_build_object(
        'codigo', 'PERFIL_ACESSO_TOTAL_MENU',
        'mensagem', 'Perfis de acesso total sempre veem todos os menus.')::text;
    end if;
    if not v_perfil.sistema then
      update perfil set nome = btrim(p_nome), descricao = nullif(btrim(p_descricao), '')
       where id = p_perfil_id;
    end if;
    insert into perfil_permissao (tenant_id, perfil_id, permissao_id)
    select v_tenant, p_perfil_id, p.id from permissao p where p.tenant_id = v_tenant
    on conflict (tenant_id, perfil_id, permissao_id) do nothing;

  -- Perfil de sistema (padrão de fábrica): somente leitura, como já era na tela
  elsif v_perfil.sistema then
    raise exception using errcode = 'P0001', message = jsonb_build_object(
      'codigo', 'PERFIL_SISTEMA_SOMENTE_LEITURA',
      'mensagem', 'Perfis do sistema não podem ser alterados. Duplique o perfil para personalizar.')::text;

  else
    update perfil set nome = btrim(p_nome), descricao = nullif(btrim(p_descricao), '')
     where id = p_perfil_id;

    v_pedidas := array(select distinct x from unnest(coalesce(p_permissoes, '{}'::uuid[])) x where x is not null);
    -- Aceita permissões do tenant e as globais (tenant_id nulo) ligadas a módulo do tenant,
    -- que é o que a tela carrega pelo modulo_id.
    v_validas := array(
      select p.id from permissao p join modulo m on m.id = p.modulo_id
       where p.id = any(v_pedidas) and m.tenant_id = v_tenant
         and (p.tenant_id = v_tenant or p.tenant_id is null));

    if cardinality(v_validas) <> cardinality(v_pedidas) then
      raise exception using errcode = 'P0001', message = jsonb_build_object(
        'codigo', 'PERFIL_PERMISSAO_INVALIDA',
        'mensagem', 'Uma ou mais permissões não pertencem a esta empresa. Recarregue a tela.')::text;
    end if;

    delete from perfil_permissao
     where perfil_id = p_perfil_id and tenant_id = v_tenant
       and permissao_id <> all(v_validas);

    insert into perfil_permissao (tenant_id, perfil_id, permissao_id)
    select v_tenant, p_perfil_id, x from unnest(v_validas) x
    on conflict (tenant_id, perfil_id, permissao_id) do nothing;

    for v_item in select value from jsonb_array_elements(coalesce(p_menus, '[]'::jsonb)) loop
      v_grupo := v_item->>'menu_grupo';
      if v_grupo is null or not exists (
           select 1 from modulo m where m.tenant_id = v_tenant and m.menu_grupo = v_grupo) then
        raise exception using errcode = 'P0001', message = jsonb_build_object(
          'codigo', 'PERFIL_MENU_INVALIDO',
          'mensagem', format('Menu "%s" não existe.', coalesce(v_grupo, '')))::text;
      end if;
      insert into perfil_menu_config (tenant_id, perfil_id, menu_grupo, visivel, updated_at, updated_by)
      values (v_tenant, p_perfil_id, v_grupo, coalesce((v_item->>'visivel')::boolean, true), now(), v_usuario)
      on conflict (tenant_id, perfil_id, menu_grupo) do update
        set visivel = excluded.visivel, updated_at = now(), updated_by = excluded.updated_by;
    end loop;
  end if;

  -- Ninguém tira de si mesmo o acesso a esta tela
  if v_tinha and not fn_usuario_tem_permissao(v_usuario, 'web.config.perfis', 'UPDATE') then
    raise exception using errcode = 'P0001', message = jsonb_build_object(
      'codigo', 'PERFIL_AUTOBLOQUEIO',
      'mensagem', 'Esta alteração tiraria o seu próprio acesso a Perfis de Acesso. Mantenha Configurações visível e Perfis de Acesso com Editar.')::text;
  end if;

  return jsonb_build_object(
    'perfil_id', p_perfil_id,
    'concedidas', (select count(*) from perfil_permissao where perfil_id = p_perfil_id),
    'menus_ocultos', coalesce((select jsonb_agg(menu_grupo order by menu_grupo) from perfil_menu_config
                                where perfil_id = p_perfil_id and not visivel), '[]'::jsonb));
end $$;

create or replace function public.rpc_perfil_excluir(p_perfil_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_tenant   uuid := get_current_tenant();
  v_usuario  uuid;
  v_perfil   public.perfil%rowtype;
  v_usuarios integer;
begin
  select u.id into v_usuario
    from usuario u
   where u.auth_user_id = auth.uid() and u.tenant_id = v_tenant and u.ativo;

  if v_tenant is null or v_usuario is null or not (
       not exists (select 1 from usuario_perfil up where up.usuario_id = v_usuario)
       or exists (select 1 from usuario_perfil up join perfil pf on pf.id = up.perfil_id
                   where up.usuario_id = v_usuario and pf.acesso_total)
       or fn_usuario_tem_permissao(v_usuario, 'web.config.perfis', 'DELETE')
     ) then
    raise exception using errcode = 'P0001', message = jsonb_build_object(
      'codigo', 'PERFIL_ACESSO_NEGADO',
      'mensagem', 'Você não tem permissão para excluir perfis de acesso.')::text;
  end if;

  select * into v_perfil from perfil
   where id = p_perfil_id and tenant_id = v_tenant
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = jsonb_build_object(
      'codigo', 'PERFIL_NAO_ENCONTRADO', 'mensagem', 'Perfil não encontrado.')::text;
  end if;

  if v_perfil.sistema or v_perfil.acesso_total then
    raise exception using errcode = 'P0001', message = jsonb_build_object(
      'codigo', 'PERFIL_SISTEMA_SOMENTE_LEITURA',
      'mensagem', 'Perfis do sistema e de acesso total não podem ser excluídos.')::text;
  end if;

  select count(*) into v_usuarios from usuario_perfil where perfil_id = p_perfil_id;
  if v_usuarios > 0 then
    raise exception using errcode = 'P0001', message = jsonb_build_object(
      'codigo', 'PERFIL_COM_USUARIOS',
      'mensagem', format('%s usuário(s) usam este perfil. Troque o perfil deles em Usuários antes de excluir.', v_usuarios))::text;
  end if;

  delete from perfil_menu_config where perfil_id = p_perfil_id;
  delete from perfil_permissao   where perfil_id = p_perfil_id;
  delete from perfil             where id = p_perfil_id;

  return jsonb_build_object('perfil_id', p_perfil_id, 'excluido', true);
end $$;

revoke execute on function public.rpc_perfil_salvar(uuid, text, text, uuid[], jsonb) from public, anon;
revoke execute on function public.rpc_perfil_excluir(uuid) from public, anon;
grant execute on function public.rpc_perfil_salvar(uuid, text, text, uuid[], jsonb) to authenticated;
grant execute on function public.rpc_perfil_excluir(uuid) to authenticated;
