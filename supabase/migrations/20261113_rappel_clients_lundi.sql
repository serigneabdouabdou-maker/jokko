-- Rappel des clients, le lundi à 9 h (Dakar) (demande de Fallou, 13/11/2026) : notification au patron
-- « 3 clients fidèles ne sont pas venus depuis 2 mois (…) ; 2 dettes en retard : 18 500 F (…) ».
-- Même règle que l'appli (src/data/clientFiles.ts) : fidèle = au moins 3 jours de visite (achat, dépôt, récupération,
-- commande, livraison) ; à relancer = rien depuis plus de 60 jours ; mauvais payeur = dette dont l'échéance est passée.
-- Le toucher ouvre l'écran Clients sur le bon groupe, campagne WhatsApp prête (./?ecran=clients&groupe=…).

create or replace function private.clients_week_list()
returns table (shop_id text, relancer int, relancer_noms text, payeurs int, payeurs_noms text, du bigint)
language sql stable security definer set search_path to '' as $$
  with visits as (
    select v.shop_id, v.client_id, (v.at at time zone 'Africa/Dakar')::date as d from public.sales v where v.client_id is not null
    union select r.shop_id, r.client_id, (r.at at time zone 'Africa/Dakar')::date from public.repairs r where r.client_id is not null and r.status <> 'annule'
    union select r.shop_id, r.client_id, (r.returned_at at time zone 'Africa/Dakar')::date from public.repairs r where r.client_id is not null and r.returned_at is not null
    union select o.shop_id, o.client_id, (o.at at time zone 'Africa/Dakar')::date from public.couture_orders o where o.client_id is not null and o.status <> 'annule'
    union select o.shop_id, o.client_id, (o.delivered_at at time zone 'Africa/Dakar')::date from public.couture_orders o where o.client_id is not null and o.delivered_at is not null
  ),
  per as (select v.shop_id, v.client_id, count(distinct v.d) as n, max(v.d) as last from visits v group by 1, 2),
  rel as (
    select p.shop_id, count(*)::int as n,
           array_to_string((array_agg(split_part(c.name, ' ', 1) order by p.n desc))[1:3], ', ') || case when count(*) > 3 then '…' else '' end as names
    from per p join public.clients c on c.id = p.client_id and c.shop_id = p.shop_id
    where p.n >= 3 and p.last < (now() at time zone 'Africa/Dakar')::date - 60
      and not (c.debt > 0 and c.due_at < now())
    group by p.shop_id
  ),
  pay as (
    select c.shop_id, count(*)::int as n, sum(c.debt)::bigint as owed,
           array_to_string((array_agg(split_part(c.name, ' ', 1) order by c.debt desc))[1:3], ', ') || case when count(*) > 3 then '…' else '' end as names
    from public.clients c where c.debt > 0 and c.due_at < now()
    group by c.shop_id
  )
  select s.id, coalesce(rel.n, 0), rel.names, coalesce(pay.n, 0), pay.names, coalesce(pay.owed, 0)
  from public.shops s
  left join rel on rel.shop_id = s.id
  left join pay on pay.shop_id = s.id
  where s.deleted_at is null and (rel.n > 0 or pay.n > 0)
$$;
revoke all on function private.clients_week_list() from public;

create or replace function private.clients_week_watch()
returns integer language plpgsql security definer set search_path to '' as $$
declare r record; v_sent integer := 0; v_body text;
declare v_week text := to_char(date_trunc('week', now() at time zone 'Africa/Dakar'), 'YYYYMMDD');
begin
  for r in select * from private.clients_week_list() loop
    v_body := concat_ws(' ',
      case when r.relancer > 0 then
        r.relancer || case when r.relancer > 1 then ' clients fidèles ne sont pas venus' else ' client fidèle n''est pas venu' end
        || ' depuis 2 mois (' || r.relancer_noms || ').' end,
      case when r.payeurs > 0 then
        r.payeurs || case when r.payeurs > 1 then ' dettes en retard : ' else ' dette en retard : ' end
        || replace(to_char(r.du, 'FM999G999G999'), ',', ' ') || ' F (' || r.payeurs_noms || ').' end,
      'Touche pour les relancer sur WhatsApp.');
    perform private.call_notify(jsonb_build_object(
      'kind', 'boutique', 'shop', r.shop_id, 'tag', 'clients-' || v_week,
      'title', 'Tes clients cette semaine',
      'body', v_body,
      'url', case when r.relancer > 0 then './?ecran=clients&groupe=relancer' else './?ecran=clients&groupe=payeur' end));
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end $$;
revoke all on function private.clients_week_watch() from public;

select cron.unschedule('jokko-clients-lundi') where exists (select 1 from cron.job where jobname = 'jokko-clients-lundi');
select cron.schedule('jokko-clients-lundi', '7 9 * * 1', 'select private.clients_week_watch()');
