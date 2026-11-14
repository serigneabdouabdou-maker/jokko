-- Taille des demandes envoyées à Gemini, par boutique (14/11/2026, demande de Fallou) :
-- voir venir une boutique qui grossit bien avant la limite (32 Ko visés par l'appli, 64 Ko acceptés par le serveur).
alter table public.gemini_calls add column if not exists bytes int;
alter table public.gemini_calls add column if not exists sent_products int;
create index if not exists gemini_calls_bytes_at on public.gemini_calls (at) where bytes is not null;

create or replace function public.payload_stats()
returns json
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  today date := (now() at time zone 'Africa/Dakar')::date;
begin
  if not private.is_admin() then raise exception 'réservé à l''admin'; end if;
  return json_build_object(
    'limite', 32768,
    'limite_serveur', 65536,
    'boutiques', coalesce((
      select json_agg(row_to_json(b) order by b.max_7j desc)
      from (
        select
          g.shop_id,
          coalesce(min(s.name), '(boutique inconnue)') as nom,
          (select count(*) from public.products p where p.shop_id = g.shop_id)::int as articles,
          (select count(*) from public.clients c where c.shop_id = g.shop_id)::int as clients,
          coalesce(max(g.bytes) filter (where (g.at at time zone 'Africa/Dakar')::date = today), 0)::int as max_jour,
          max(g.bytes)::int as max_7j,
          round(avg(g.bytes))::int as moyenne_7j,
          max(g.sent_products)::int as articles_envoyes,
          count(*)::int as appels_7j,
          count(*) filter (where g.status = 413)::int as refus_7j,
          (
            select json_agg(json_build_object('jour', d::date, 'max', coalesce(x.m, 0)) order by d)
            from generate_series(today - 6, today, interval '1 day') d
            left join lateral (
              select max(g2.bytes) m from public.gemini_calls g2
              where g2.shop_id = g.shop_id and g2.bytes is not null and (g2.at at time zone 'Africa/Dakar')::date = d::date
            ) x on true
          ) as jours
        from public.gemini_calls g
        left join public.shops s on s.id = g.shop_id
        where g.bytes is not null and g.at > now() - interval '7 days' and g.shop_id is not null
        group by g.shop_id
      ) b
    ), '[]'::json)
  );
end $$;

revoke all on function public.payload_stats() from public, anon;
grant execute on function public.payload_stats() to authenticated;
