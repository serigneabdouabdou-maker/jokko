-- Fabrique de modèles du Studio (console admin) : Fallou choisit combien de modèles (genre, occasion, âge),
-- voit le coût estimé, et la file est traitée toute seule (2 images par minute), avec un plafond de dépense par jour.

-- 1. Rubriques des modèles : occasion (Tabaski, Korité, Magal…) et tranche d'âge
alter table public.couture_models add column if not exists occasion text not null default 'quotidien';
alter table public.couture_models add column if not exists age text not null default '';
update public.couture_models set occasion = 'tabaski' where title ilike '%tabaski%' and occasion = 'quotidien';
update public.couture_models set occasion = 'mariage' where (title ilike '%mariage%') and occasion = 'quotidien';
update public.couture_models set occasion = 'ceremonie' where (title ilike '%cérémonie%' or title ilike '%soirée%') and occasion = 'quotidien';
update public.couture_models set age = 'enfant' where category = 'enfant' and age = '';
update public.couture_models set age = 'adulte' where category <> 'enfant' and age = '';

-- 2. File d'attente des images à fabriquer
create table if not exists public.studio_queue (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('homme', 'femme', 'enfant')),
  occasion text not null default 'quotidien',
  age text not null default '',
  status text not null default 'attente' check (status in ('attente', 'encours', 'fait', 'erreur')),
  model_id uuid,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  done_at timestamptz
);
alter table public.studio_queue enable row level security;
create index if not exists studio_queue_status on public.studio_queue (status, created_at);

insert into private.app_config (key, value) values
  ('cout_image_galerie', '20'),       -- F par modèle fabriqué (Nano Banana 2.1, 1K)
  ('plafond_images_jour', '2000'),    -- F par jour au maximum pour la fabrique (≈ 100 modèles)
  ('images_par_minute', '2')
on conflict (key) do nothing;

-- 3. Commander des modèles (admin) : renvoie le nombre et le coût estimé
create or replace function public.studio_enqueue(p_category text, p_occasion text, p_age text, p_count int)
returns json language plpgsql security definer set search_path = '' as $$
declare n int := least(greatest(coalesce(p_count, 0), 0), 100);
declare price int := coalesce((select value::int from private.app_config where key = 'cout_image_galerie'), 20);
begin
  if not private.is_admin() then raise exception 'réservé à l''admin'; end if;
  if p_category not in ('homme', 'femme', 'enfant') then raise exception 'genre inconnu'; end if;
  insert into public.studio_queue (category, occasion, age)
  select p_category, coalesce(nullif(p_occasion, ''), 'quotidien'), coalesce(p_age, '') from generate_series(1, n);
  return json_build_object('ajoutes', n, 'cout_estime', n * price);
end $$;
revoke all on function public.studio_enqueue(text, text, text, int) from public, anon;
grant execute on function public.studio_enqueue(text, text, text, int) to authenticated;

-- Annuler ce qui attend encore (rien n'est dépensé pour ces lignes)
create or replace function public.studio_cancel()
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not private.is_admin() then raise exception 'réservé à l''admin'; end if;
  update public.studio_queue set status = 'erreur', error = 'annulé', done_at = now() where status = 'attente';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.studio_cancel() from public, anon;
grant execute on function public.studio_cancel() to authenticated;

-- 4. Tableau de la fabrique : aujourd'hui, ce mois, la file, les essayages, la galerie par rubrique
create or replace function public.studio_stats()
returns json language plpgsql stable security definer set search_path = '' as $$
declare price int := coalesce((select value::int from private.app_config where key = 'cout_image_galerie'), 20);
declare tryon numeric := coalesce((select value::numeric from private.app_config where key = 'cout_image'), 25);
declare cap int := coalesce((select value::int from private.app_config where key = 'plafond_images_jour'), 2000);
declare today date := (now() at time zone 'Africa/Dakar')::date;
begin
  if not private.is_admin() then raise exception 'réservé à l''admin'; end if;
  return json_build_object(
    'prix_image', price, 'prix_essayage', tryon, 'plafond_jour', cap,
    'fabriques_jour', (select count(*) from public.studio_queue where status = 'fait' and (done_at at time zone 'Africa/Dakar')::date = today),
    'fabriques_mois', (select count(*) from public.studio_queue where status = 'fait' and done_at >= date_trunc('month', now() at time zone 'Africa/Dakar') at time zone 'Africa/Dakar'),
    'erreurs_jour', (select count(*) from public.studio_queue where status = 'erreur' and coalesce(error, '') <> 'annulé' and (done_at at time zone 'Africa/Dakar')::date = today),
    'en_attente', (select count(*) from public.studio_queue where status in ('attente', 'encours')),
    'essayages_jour', (select coalesce(sum(n), 0) from public.assistant_usage where kind = 'image' and day = today),
    'essayages_mois', (select coalesce(sum(n), 0) from public.assistant_usage where kind = 'image' and day >= date_trunc('month', today)::date),
    'galerie_total', (select count(*) from public.couture_models where published),
    'par_rubrique', (select coalesce(json_agg(r), '[]'::json) from (
      select category, occasion, count(*) n from public.couture_models where published group by 1, 2 order by 1, 2) r),
    'jours', (select coalesce(json_agg(d order by d.jour desc), '[]'::json) from (
      select (done_at at time zone 'Africa/Dakar')::date jour, count(*) filter (where status = 'fait') faits, count(*) filter (where status = 'erreur' and coalesce(error, '') <> 'annulé') erreurs
      from public.studio_queue where done_at > now() - interval '14 days' group by 1) d)
  );
end $$;
revoke all on function public.studio_stats() from public, anon;
grant execute on function public.studio_stats() to authenticated;

-- 5. Retirer un modèle de la galerie (admin) : il n'apparaît plus, l'image reste stockée
create or replace function public.studio_hide(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'réservé à l''admin'; end if;
  update public.couture_models set published = false where id = p_id;
end $$;
revoke all on function public.studio_hide(uuid) from public, anon;
grant execute on function public.studio_hide(uuid) to authenticated;

-- 6. Prendre le prochain travail (serveur seulement) : respecte le plafond du jour, relance ce qui est bloqué
create or replace function public.studio_next()
returns setof public.studio_queue language plpgsql security definer set search_path = '' as $$
declare price int := coalesce((select value::int from private.app_config where key = 'cout_image_galerie'), 20);
declare cap int := coalesce((select value::int from private.app_config where key = 'plafond_images_jour'), 2000);
declare done int := (select count(*) from public.studio_queue where status = 'fait' and (done_at at time zone 'Africa/Dakar')::date = (now() at time zone 'Africa/Dakar')::date);
begin
  update public.studio_queue set status = 'attente', started_at = null where status = 'encours' and started_at < now() - interval '5 minutes';
  if done * price >= cap then return; end if;
  return query
  with taken as (
    update public.studio_queue q set status = 'encours', started_at = now()
    where q.id = (select id from public.studio_queue where status = 'attente' order by created_at limit 1 for update skip locked)
    returning q.*)
  select * from taken;
end $$;
revoke all on function public.studio_next() from public, anon, authenticated;
grant execute on function public.studio_next() to service_role;

create or replace function public.studio_done(p_id uuid, p_model uuid, p_error text)
returns void language sql security definer set search_path = '' as $$
  update public.studio_queue set status = case when p_model is null then 'erreur' else 'fait' end, model_id = p_model, error = left(p_error, 300), done_at = now() where id = p_id;
$$;
revoke all on function public.studio_done(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.studio_done(uuid, uuid, text) to service_role;

-- 7. Chaque minute : s'il y a du travail, la fonction galerie fabrique N images (une par appel)
create or replace function private.studio_tick()
returns void language plpgsql security definer set search_path = '' as $$
declare per int := coalesce((select value::int from private.app_config where key = 'images_par_minute'), 2);
begin
  if not exists (select 1 from public.studio_queue where status = 'attente') then return; end if;
  for i in 1..least(per, 6) loop
    perform net.http_post(
      url := 'https://solocpbqtqlxdfpjiewm.supabase.co/functions/v1/galerie',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := jsonb_build_object('token', (select value from private.app_config where key = 'galerie_token'), 'action', 'suivant'),
      timeout_milliseconds := 120000);
  end loop;
end $$;

select cron.schedule('jokko-fabrique-modeles', '* * * * *', 'select private.studio_tick()');
