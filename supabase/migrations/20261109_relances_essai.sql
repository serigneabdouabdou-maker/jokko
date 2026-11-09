-- Essais à appeler (09/11/2026, demande de Fallou) : quand l'essai d'un commerçant se termine (temps ou forfait),
-- Fallou reçoit une notification avec le nom et le téléphone, et la liste « À appeler » dans la console.
create table if not exists public.relances (
  shop_id text primary key references public.shops(id) on delete cascade,
  raison text not null check (raison in ('epuise', 'bientot', 'fini')),
  created_at timestamptz not null default now(),
  appele_at timestamptz,
  issue text check (issue in ('paye', 'rappeler', 'non'))
);
alter table public.relances enable row level security;
revoke all on public.relances from anon, authenticated;

-- Téléphone du patron : celui de la boutique, sinon celui du compte (connexion par numéro).
create or replace function private.shop_contact(p_shop text)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(regexp_replace(s.phone, '\D', '', 'g'), ''), split_part(u.email, '@', 1))
  from public.shops s left join auth.users u on u.id = s.owner_id where s.id = p_shop;
$$;

create or replace function private.trial_watch()
returns void language plpgsql security definer set search_path = '' as $$
declare r record;
declare n int := 0;
declare total int;
declare why text;
begin
  for r in
    select s.id, s.name, s.trial_until,
      case
        when s.trial_until <= now() then 'fini'
        when coalesce((select sum(u.n) from public.assistant_usage u where u.shop_id = s.id and u.kind = 'echange'), 0) >= private.trial_total('echange')
         and coalesce((select sum(u.n) from public.assistant_usage u where u.shop_id = s.id and u.kind = 'vocal'), 0) >= private.trial_total('vocal') then 'epuise'
        when s.trial_until <= now() + interval '2 days' then 'bientot'
      end raison
    from public.shops s
    where s.deleted_at is null and s.trial_until is not null
      and s.trial_until > now() - interval '3 days'
      and not (s.plan in ('medium', 'avance') and s.plan_until > now())
      and s.owner_id not in (select user_id from private.platform_admins)
      and not exists (select 1 from public.relances x where x.shop_id = s.id)
  loop
    continue when r.raison is null;
    insert into public.relances (shop_id, raison) values (r.id, r.raison) on conflict do nothing;
    n := n + 1;
    if n <= 5 then
      select count(*) into total from public.sales where shop_id = r.id and at > now() - interval '30 days';
      why := case r.raison when 'fini' then 'Son essai est fini' when 'epuise' then 'Il a utilisé tout son essai de voix' else 'Son essai finit dans moins de 2 jours' end;
      perform private.admin_event('abonnement', 'À appeler : ' || r.name,
        why || '. Il a noté ' || total || ' vente(s) avec Jokko. Tél : ' || coalesce(private.shop_contact(r.id), '?') || '. Console, onglet « À appeler ».',
        r.id, '{"type":"relance"}'::jsonb, true);
    end if;
  end loop;
  if n > 5 then
    perform private.admin_event('abonnement', (n - 5) || ' autres essais à appeler', 'La liste complète est dans la console, onglet « À appeler ».', null, '{"type":"relance"}'::jsonb, true);
  end if;
end $$;

-- Lancée avec la surveillance (toutes les 5 min).
do $$
declare d text := pg_get_functiondef('private.guard_watch()'::regprocedure);
begin
  if position('trial_watch' in d) > 0 then return; end if;
  d := regexp_replace(d, 'end \$function\$\s*$', E'  perform private.trial_watch();\nend $function$');
  if position('trial_watch' in d) = 0 then raise exception 'guard_watch : texte inattendu'; end if;
  execute d;
end $$;

-- Console : la liste à appeler (les plus récents d'abord ; ceux à rappeler restent en haut).
create or replace function public.relances_list()
returns json language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'réservé à l''admin'; end if;
  return (select coalesce(json_agg(r order by (r.issue is null or r.issue = 'rappeler') desc, r.created_at desc), '[]'::json) from (
    select x.shop_id, s.name nom, s.city ville, s.activity metier, x.raison, x.created_at, x.appele_at, x.issue,
      private.shop_contact(x.shop_id) tel, private.assistant_tier(x.shop_id) offre,
      (select count(*) from public.sales v where v.shop_id = x.shop_id and v.at > now() - interval '30 days') ventes,
      (select coalesce(sum(u.n), 0) from public.assistant_usage u where u.shop_id = x.shop_id and u.kind in ('vocal', 'echange', 'texte')) usages
    from public.relances x join public.shops s on s.id = x.shop_id
    where x.created_at > now() - interval '60 days' limit 200) r);
end $$;
revoke all on function public.relances_list() from public, anon;
grant execute on function public.relances_list() to authenticated;

create or replace function public.relance_mark(p_shop text, p_issue text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'réservé à l''admin'; end if;
  if p_issue not in ('paye', 'rappeler', 'non') then raise exception 'issue inconnue'; end if;
  update public.relances set issue = p_issue, appele_at = now() where shop_id = p_shop;
end $$;
revoke all on function public.relance_mark(text, text) from public, anon;
grant execute on function public.relance_mark(text, text) to authenticated;
