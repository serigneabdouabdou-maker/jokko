-- Console : Fallou règle lui-même le plafond de dépense par jour de la fabrique de modèles.
create or replace function public.studio_set_cap(p_cap int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'réservé à l''admin'; end if;
  insert into private.app_config (key, value) values ('plafond_images_jour', greatest(0, least(coalesce(p_cap, 0), 100000))::text)
  on conflict (key) do update set value = excluded.value;
end $$;
revoke all on function public.studio_set_cap(int) from public, anon;
grant execute on function public.studio_set_cap(int) to authenticated;
