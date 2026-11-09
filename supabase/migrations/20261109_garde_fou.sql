-- Garde-fou du budget Gemini (demande de Fallou, 09/11/2026) :
-- 1. Essayage d'image : réservé à l'offre Avancé (5 par jour) ; l'essai gratuit a droit à 1 seul essayage ; gratuit et Médium : 0.
-- 2. Plafond global par jour (tous les clients + la fabrique) : au-delà, Jokko se repose jusqu'au lendemain (raison « repos »).
-- 3. Anti multi-comptes : un téléphone qui a servi à plus de 2 comptes n'a plus droit au gratuit ni à l'essai (raison « appareil »).
-- 4. Fabrique de modèles : 1 000 F par jour et 6 000 F par mois au plus.
-- 5. Surveillance : dépense prévue en fin de journée, clients qui consomment anormalement, téléphones suspects (console « Garde-fou »).

insert into private.app_config (key, value) values
  ('essai_total_image', '1'), ('plafond_global_jour', '4000'), ('plafond_images_mois', '6000'), ('comptes_par_appareil', '2')
on conflict (key) do nothing;
update private.app_config set value = '1' where key = 'quota_essai_image';
update private.app_config set value = '0' where key = 'quota_medium_image';
update private.app_config set value = '5' where key = 'quota_avance_image';
update private.app_config set value = '1000' where key = 'plafond_images_jour';

-- Téléphones (identifiant tiré au hasard par l'appli, gardé sur le téléphone) et comptes qui s'en servent
create table if not exists public.device_accounts (
  device_id text not null check (length(device_id) between 12 and 64),
  user_id uuid not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (device_id, user_id)
);
alter table public.device_accounts enable row level security;

create or replace function public.note_device(p_device text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or length(coalesce(p_device, '')) not between 12 and 64 then return; end if;
  insert into public.device_accounts (device_id, user_id) values (p_device, auth.uid())
  on conflict (device_id, user_id) do update set last_seen = now();
end $$;
revoke all on function public.note_device(text) from public, anon;
grant execute on function public.note_device(text) to authenticated;

create or replace function private.device_abuse(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.device_accounts mine
    where mine.user_id = p_user
      and (select count(distinct d.user_id) from public.device_accounts d where d.device_id = mine.device_id)
          > coalesce((select value::int from private.app_config where key = 'comptes_par_appareil'), 2));
$$;

-- Dépense estimée du jour, tous clients + fabrique
create or replace function private.cout_total_jour()
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce((select sum(n * private.assistant_cost(kind)) from public.assistant_usage where day = (now() at time zone 'Africa/Dakar')::date), 0)
       + private.studio_spent_today();
$$;

-- use_assistant : plafond global et anti multi-comptes (les admins passent avant, sans limite)
do $$
declare d text := pg_get_functiondef('public.use_assistant(text,text)'::regprocedure);
begin
  d := replace(d, $q$  if t in ('gratuit', 'essai') then
    cap := coalesce((select value::int from private.app_config where key = 'plafond_gratuit_jour'), 500);$q$,
  $q$  -- Garde-fou : un téléphone qui a servi à trop de comptes n'a plus droit au gratuit ni à l'essai.
  if t in ('gratuit', 'essai') and private.device_abuse(auth.uid()) then
    return json_build_object('ok', false, 'tier', t, 'kind', p_kind, 'limit', 0, 'used', 0, 'reason', 'appareil');
  end if;
  -- Garde-fou : plafond global de la journée (tous les clients et la fabrique).
  if private.cout_total_jour() >= coalesce((select value::numeric from private.app_config where key = 'plafond_global_jour'), 4000) then
    return json_build_object('ok', false, 'tier', t, 'kind', p_kind, 'limit', 0, 'used', 0, 'reason', 'repos');
  end if;

  if t in ('gratuit', 'essai') then
    cap := coalesce((select value::int from private.app_config where key = 'plafond_gratuit_jour'), 500);$q$);
  d := replace(d, $q$if t = 'essai' and p_kind not in ('stock', 'voix', 'image') then$q$, $q$if t = 'essai' and p_kind not in ('stock', 'voix') then$q$);
  if position('device_abuse' in d) = 0 or position($q$p_kind not in ('stock', 'voix') then$q$ in d) = 0 then raise exception 'use_assistant : texte inattendu'; end if;
  execute d;
end $$;

-- Fabrique : plafond du mois en plus du plafond du jour
create or replace function private.studio_spent_month()
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(case when vues then coalesce((select value::numeric from private.app_config where key = 'cout_image_galerie'), 60)
                           else coalesce((select value::numeric from private.app_config where key = 'cout_image_simple'), 20) end), 0)
  from public.studio_queue
  where status = 'fait' and done_at >= date_trunc('month', now() at time zone 'Africa/Dakar') at time zone 'Africa/Dakar';
$$;

create or replace function public.studio_next()
returns setof public.studio_queue language plpgsql security definer set search_path = '' as $$
declare cap int := coalesce((select value::int from private.app_config where key = 'plafond_images_jour'), 1000);
declare cap_month int := coalesce((select value::int from private.app_config where key = 'plafond_images_mois'), 6000);
begin
  update public.studio_queue set status = 'attente', started_at = null where status = 'encours' and started_at < now() - interval '5 minutes';
  if private.studio_spent_today() >= cap or private.studio_spent_month() >= cap_month then return; end if;
  return query
  with taken as (
    update public.studio_queue q set status = 'encours', started_at = now()
    where q.id = (select id from public.studio_queue where status = 'attente' order by created_at limit 1 for update skip locked)
    returning q.*)
  select * from taken;
end $$;
revoke all on function public.studio_next() from public, anon, authenticated;
grant execute on function public.studio_next() to service_role;

-- Surveillance (console « Garde-fou ») : dépense du jour et prévision, clients anormaux, téléphones suspects
create or replace function public.guard_stats()
returns json language plpgsql stable security definer set search_path = '' as $$
declare today date := (now() at time zone 'Africa/Dakar')::date;
declare hours numeric := greatest(1, extract(epoch from (now() at time zone 'Africa/Dakar') - today::timestamp) / 3600);
declare spent numeric := private.cout_total_jour();
declare med numeric;
begin
  if not private.is_admin() then raise exception 'réservé à l''admin'; end if;
  select coalesce(percentile_cont(0.5) within group (order by c), 0) into med from (
    select sum(n * private.assistant_cost(kind)) c from public.assistant_usage where day = today group by shop_id) x;
  return json_build_object(
    'depense_jour', round(spent),
    'prevision_jour', round(spent / hours * 24),
    'depense_mois', round(coalesce((select sum(n * private.assistant_cost(kind)) from public.assistant_usage where day >= date_trunc('month', today)::date), 0) + private.studio_spent_month()),
    'fabrique_jour', round(private.studio_spent_today()), 'fabrique_mois', round(private.studio_spent_month()),
    'gratuits_jour', round(private.cout_gratuit_jour()),
    'plafonds', json_build_object(
      'global_jour', (select value from private.app_config where key = 'plafond_global_jour'),
      'gratuit_jour', (select value from private.app_config where key = 'plafond_gratuit_jour'),
      'images_jour', (select value from private.app_config where key = 'plafond_images_jour'),
      'images_mois', (select value from private.app_config where key = 'plafond_images_mois'),
      'comptes_par_appareil', (select value from private.app_config where key = 'comptes_par_appareil')),
    'clients', (select coalesce(json_agg(r order by r.cout desc), '[]'::json) from (
      select s.name nom, coalesce(private.assistant_tier(u.shop_id), 'gratuit') offre, round(sum(u.n * private.assistant_cost(u.kind))) cout,
             sum(u.n * private.assistant_cost(u.kind)) > greatest(300, med * 4) anormal
      from public.assistant_usage u join public.shops s on s.id = u.shop_id
      where u.day = today group by s.name, u.shop_id order by 3 desc limit 10) r),
    'appareils', (select coalesce(json_agg(r), '[]'::json) from (
      select left(device_id, 6) appareil, count(*) comptes, max(last_seen) vu
      from public.device_accounts group by device_id
      having count(*) > coalesce((select value::int from private.app_config where key = 'comptes_par_appareil'), 2)
      order by 2 desc limit 20) r),
    'nouveaux_comptes_24h', (select count(*) from public.shops where created_at > now() - interval '24 hours')
  );
end $$;
revoke all on function public.guard_stats() from public, anon;
grant execute on function public.guard_stats() to authenticated;

create or replace function public.guard_set(p_key text, p_value int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'réservé à l''admin'; end if;
  if p_key not in ('plafond_global_jour', 'plafond_gratuit_jour', 'plafond_images_jour', 'plafond_images_mois', 'comptes_par_appareil', 'alerte_cout_jour') then raise exception 'réglage inconnu'; end if;
  insert into private.app_config (key, value) values (p_key, greatest(0, least(p_value, 1000000))::text)
  on conflict (key) do update set value = excluded.value;
end $$;
revoke all on function public.guard_set(text, int) from public, anon;
grant execute on function public.guard_set(text, int) to authenticated;
