-- Coût réel par modèle : 1 photo (20 F) ou 3 vues (60 F). Le plafond du jour compte ce qui a vraiment été fabriqué.
-- (appliquée le 09/11/2026 ; studio_stats reçoit depense_jour et depense_mois)
insert into private.app_config (key, value) values ('cout_image_simple', '20') on conflict (key) do nothing;

create or replace function private.studio_spent_today()
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(case when vues then coalesce((select value::numeric from private.app_config where key = 'cout_image_galerie'), 60)
                           else coalesce((select value::numeric from private.app_config where key = 'cout_image_simple'), 20) end), 0)
  from public.studio_queue
  where status = 'fait' and (done_at at time zone 'Africa/Dakar')::date = (now() at time zone 'Africa/Dakar')::date;
$$;

create or replace function public.studio_next()
returns setof public.studio_queue language plpgsql security definer set search_path = '' as $$
declare cap int := coalesce((select value::int from private.app_config where key = 'plafond_images_jour'), 2000);
begin
  update public.studio_queue set status = 'attente', started_at = null where status = 'encours' and started_at < now() - interval '5 minutes';
  if private.studio_spent_today() >= cap then return; end if;
  return query
  with taken as (
    update public.studio_queue q set status = 'encours', started_at = now()
    where q.id = (select id from public.studio_queue where status = 'attente' order by created_at limit 1 for update skip locked)
    returning q.*)
  select * from taken;
end $$;
