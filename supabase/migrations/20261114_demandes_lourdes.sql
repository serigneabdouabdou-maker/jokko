-- Demandes refusées parce que trop lourdes (14/11/2026 : boutique de 641 pièces, écrit et direct refusés sans que CFC le sache).
-- Toutes les 5 minutes : un refus (statut 413 dans gemini_calls) → une alerte sur le téléphone de Fallou, une fois par boutique et par jour.
create or replace function private.payload_watch()
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  r record;
  today date := (now() at time zone 'Africa/Dakar')::date;
begin
  for r in
    select g.shop_id, count(*) as n, min(s.name) as shop_name
    from public.gemini_calls g
    left join public.shops s on s.id = g.shop_id
    where g.status = 413 and g.at > now() - interval '10 minutes'
    group by g.shop_id
  loop
    if exists (
      select 1 from public.admin_events
      where kind = 'anomalie' and meta->>'type' = 'trop_lourd' and coalesce(meta->>'shop', '') = coalesce(r.shop_id, '')
        and (at at time zone 'Africa/Dakar')::date = today
    ) then
      continue;
    end if;
    perform private.admin_event(
      'anomalie',
      'Demande trop lourde refusée',
      coalesce(r.shop_name, 'Une boutique') || ' : ' || r.n || ' demande(s) à Jokko refusée(s) parce que trop lourdes (beaucoup d''articles ou de clients). Préviens Claude pour régler la taille.',
      r.shop_id,
      jsonb_build_object('type', 'trop_lourd', 'shop', coalesce(r.shop_id, '')),
      true
    );
  end loop;
end $$;

select cron.unschedule('jokko-demandes-lourdes') where exists (select 1 from cron.job where jobname = 'jokko-demandes-lourdes');
select cron.schedule('jokko-demandes-lourdes', '*/5 * * * *', 'select private.payload_watch()');
