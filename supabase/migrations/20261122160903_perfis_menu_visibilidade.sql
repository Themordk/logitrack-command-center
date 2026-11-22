-- Perfis de Acesso v2 (Fase 1): visibilidade de menu por perfil + acesso total.
-- Aplicada no branch-qa em 2026-11-22 (versão 20261122160903).
-- =====================================================================
-- Fase 1 — Perfis de Acesso v2: visibilidade de menu + acesso total
-- Alvo: branch-qa (pwynobnbftqcqygjtrdk). NÃO aplicar em produção sem
-- o checklist pré-deploy.
--
-- O que já existe e é reaproveitado:
--   modulo.ambiente (WEB | COLETOR | AMBOS)  -> separação Web x Coletor
--   modulo.descricao                         -> nome amigável
--   perfil.sistema                           -> perfil padrão do sistema
--     (ATENÇÃO: em produção OPERADOR e SUPERVISOR também têm sistema = true,
--      por isso "acesso total" ganha uma coluna própria)
-- =====================================================================


-- 1) Perfil com acesso total (recebe toda permissão nova automaticamente)
alter table public.perfil
  add column if not exists acesso_total boolean not null default false;

update public.perfil
   set acesso_total = true
 where upper(nome) = 'ADMINISTRADOR';

-- 2) Grupo de menu do TopNav (só WEB). Chave estável usada pelo menuRegistry.
alter table public.modulo
  add column if not exists menu_grupo text;

update public.modulo set menu_grupo = case
    when codigo = 'web.dashboard'                  then 'torre'
    when codigo like 'web.atividades.%'            then 'operacao'
    when codigo like 'web.armazem.%'               then 'armazem'
    when codigo like 'web.dados-mestres.%'         then 'cadastros'
    when codigo like 'web.lms.%'                   then 'produtividade'
    when codigo like 'web.relatorios.%'            then 'relatorios'
    when codigo like 'web.config.integracao%'      then 'integracoes'
    when codigo like 'web.config.%'                then 'configuracoes'
  end
 where ambiente = 'WEB' and menu_grupo is null;

create index if not exists idx_modulo_menu_grupo on public.modulo (tenant_id, menu_grupo);

-- 3) Visibilidade de menu por perfil (opção B: oculta sem apagar permissões)
create table if not exists public.perfil_menu_config (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenant(id),
  perfil_id   uuid not null references public.perfil(id) on delete cascade,
  menu_grupo  text not null,
  visivel     boolean not null default true,
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  unique (tenant_id, perfil_id, menu_grupo)
);

create index if not exists idx_perfil_menu_config_perfil
  on public.perfil_menu_config (perfil_id) where visivel = false;

alter table public.perfil_menu_config enable row level security;

drop policy if exists tenant_full_access on public.perfil_menu_config;
create policy tenant_full_access on public.perfil_menu_config
  for all
  using (tenant_id = get_current_tenant())
  with check (tenant_id = get_current_tenant());

-- 4) Toda permissão nova vai para os perfis de acesso total do mesmo tenant
create or replace function public.tg_permissao_conceder_acesso_total()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.tenant_id is not null then
    insert into public.perfil_permissao (tenant_id, perfil_id, permissao_id)
    select new.tenant_id, pf.id, new.id
      from public.perfil pf
     where pf.tenant_id = new.tenant_id
       and pf.acesso_total = true
    on conflict (tenant_id, perfil_id, permissao_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists trg_permissao_conceder_acesso_total on public.permissao;
create trigger trg_permissao_conceder_acesso_total
  after insert on public.permissao
  for each row execute function public.tg_permissao_conceder_acesso_total();

-- Backfill: corrige o caso "ADMINISTRADOR com coletor.lms 0/3"
insert into public.perfil_permissao (tenant_id, perfil_id, permissao_id)
select pf.tenant_id, pf.id, p.id
  from public.perfil pf
  join public.permissao p on p.tenant_id = pf.tenant_id
 where pf.acesso_total = true
on conflict (tenant_id, perfil_id, permissao_id) do nothing;

-- 5) Permissão efetiva = concedida E menu visível no perfil que concedeu
create or replace function public.fn_usuario_permissoes(p_usuario_id uuid)
returns table(modulo_codigo text, acao text)
language sql
stable security definer
set search_path to 'public'
as $$
  select distinct m.codigo, p.acao::text
    from usuario_perfil up
    join perfil per          on per.id = up.perfil_id and per.ativo = true
    join perfil_permissao pp on pp.perfil_id = up.perfil_id and pp.tenant_id = up.tenant_id
    join permissao p         on p.id = pp.permissao_id
    join modulo m            on m.id = p.modulo_id and m.ativo = true
   where up.usuario_id = p_usuario_id
     and not exists (
       select 1 from perfil_menu_config c
        where c.perfil_id = up.perfil_id
          and c.menu_grupo = m.menu_grupo
          and c.visivel = false)
$$;

create or replace function public.fn_usuario_tem_permissao(p_usuario_id uuid, p_modulo_codigo text, p_acao text)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1
      from usuario_perfil up
      join perfil_permissao pp on pp.perfil_id = up.perfil_id and pp.tenant_id = up.tenant_id
      join permissao p         on p.id = pp.permissao_id
      join modulo m            on m.id = p.modulo_id
     where up.usuario_id = p_usuario_id
       and m.codigo = p_modulo_codigo
       and p.acao::text = p_acao
       and m.ativo = true
       and not exists (
         select 1 from perfil_menu_config c
          where c.perfil_id = up.perfil_id
            and c.menu_grupo = m.menu_grupo
            and c.visivel = false)
  )
$$;


-- ROLLBACK (manual):
-- drop trigger if exists trg_permissao_conceder_acesso_total on public.permissao;
-- drop function if exists public.tg_permissao_conceder_acesso_total();
-- drop table if exists public.perfil_menu_config;
-- alter table public.modulo drop column if exists menu_grupo;
-- alter table public.perfil drop column if exists acesso_total;
-- + recriar fn_usuario_permissoes / fn_usuario_tem_permissao na versão anterior
--   (as permissões concedidas no backfill continuam; remover só se necessário)
