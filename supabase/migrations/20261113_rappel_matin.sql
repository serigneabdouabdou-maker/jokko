-- Rappel du matin, chaque jour à 8 h 37 (Dakar) (demande de Fallou, 13/11/2026) : une notification au patron
-- avec ce qui l'attend. Mêmes règles que l'appli (src/data/reorder.ts) pour la commande prête :
--  - commande : lignes gardées (shops.to_order) + pièces des appareils au dépôt pas en stock + stock sous le seuil
--    + pièces parties en 30 jours (ventes + pièces posées) qui ne tiendront pas 7 jours ; sans les conseils écartés depuis < 7 jours ;
--  - téléphones réparés qui attendent leur client ; appareils au dépôt depuis plus de 7 jours ;
--  - habits prêts pas encore récupérés (tailleurs) ; dettes dont l'échéance est aujourd'hui ou passée ; licences qui finissent dans 7 jours.
-- Rien à dire = pas de notification. Les plats et portions préparés (restaurant, boulangerie) ne se commandent pas.

create or replace function private.morning_list()
returns table (shop_id text, url text, body text)
language plpgsql stable security definer set search_path to '' as $$
declare
  s record;
  v_today date := (now() at time zone 'Africa/Dakar')::date;
  v_names text[];
  v_count int;
  v_cost bigint;
  v_parts text[];
  n int;
  m bigint;
  v_lic text;
  v_word text;
begin
  for s in select sh.id, sh.to_order, sh.licences from public.shops sh where sh.deleted_at is null loop
    v_parts := '{}';
    -- 1) Commande prête
    with ignored as (
      select (l->>'productId') as pid from jsonb_array_elements(s.to_order) l
      where coalesce((l->>'qty')::numeric, 0) <= 0 and l->>'productId' is not null and (l->>'at')::timestamptz > now() - interval '7 days'
    ),
    kept as (
      select coalesce(p.name, l->>'name') as name, l->>'productId' as pid, (l->>'qty')::numeric as qty, p.cost
      from jsonb_array_elements(s.to_order) l left join public.products p on p.id = l->>'productId' and p.shop_id = s.id
      where coalesce((l->>'qty')::numeric, 0) > 0
    ),
    used as (
      select u.pid, sum(u.q) as q from (
        select v.product_id as pid, coalesce(v.qty, 1) as q from public.sales v
        where v.shop_id = s.id and v.product_id is not null and not coalesce(v.retail, false) and v.at >= now() - interval '30 days'
        union all
        select x->>'productId', coalesce(nullif(x->>'qty', '')::numeric, 1) from public.repairs r, jsonb_array_elements(r.parts) x
        where r.shop_id = s.id and r.status <> 'annule' and coalesce(r.repaired_at, r.at) >= now() - interval '30 days' and x->>'productId' is not null
      ) u group by u.pid
    ),
    advice as (
      select p.id as pid, p.name, p.cost from public.products p
      where p.shop_id = s.id
        and lower(p.unit) !~ '^(plat|portion|part|verre|baguette)s?$'
        and p.id not in (select pid from ignored) and p.id not in (select k.pid from kept k where k.pid is not null)
        and (
          (p.stock <= 0 and exists (select 1 from public.repairs r where r.shop_id = s.id and r.status = 'depot' and length(p.name) >= 4 and position(lower(p.name) in lower(r.problem)) > 0))
          or (p.min > 0 and p.stock <= p.min)
          or exists (select 1 from used u where u.pid = p.id and u.q > 0 and p.stock < greatest(1, ceil(u.q * 7 / 30.0)))
        )
    ),
    allp as (select name, cost from kept union all select name, cost from advice)
    select array_agg(name), count(*), sum(coalesce(cost, 0)) into v_names, v_count, v_cost from allp;
    if v_count > 0 then
      v_word := case when exists (select 1 from public.repairs r where r.shop_id = s.id) then 'pièce' else 'article' end;
      v_parts := v_parts || ('Commande prête : ' || v_count || ' ' || v_word || case when v_count > 1 then 's (' else ' (' end
        || array_to_string(v_names[1:2], ', ') || case when v_count > 2 then '…' else '' end || ').');
    end if;
    -- 2) Réparés qui attendent le client ; dépôts anciens
    select count(*) into n from public.repairs r where r.shop_id = s.id and r.status = 'repare';
    if n > 0 then v_parts := v_parts || (n || case when n > 1 then ' appareils réparés attendent leur client.' else ' appareil réparé attend son client.' end); end if;
    select count(*) into n from public.repairs r where r.shop_id = s.id and r.status = 'depot' and r.at < now() - interval '7 days';
    if n > 0 then v_parts := v_parts || (n || case when n > 1 then ' appareils au dépôt depuis plus de 7 jours.' else ' appareil au dépôt depuis plus de 7 jours.' end); end if;
    -- 3) Habits prêts pas récupérés
    select count(*) into n from public.couture_orders o where o.shop_id = s.id and o.status = 'pret';
    if n > 0 then v_parts := v_parts || (n || case when n > 1 then ' habits prêts pas encore récupérés.' else ' habit prêt pas encore récupéré.' end); end if;
    -- 4) Dettes à encaisser (échéance aujourd'hui ou passée)
    select count(*), coalesce(sum(c.debt), 0) into n, m from public.clients c
    where c.shop_id = s.id and c.debt > 0 and c.due_at is not null and (c.due_at at time zone 'Africa/Dakar')::date <= v_today;
    if n > 0 then v_parts := v_parts || ('Dettes à encaisser : ' || n || ' (' || replace(to_char(m, 'FM999G999G999'), ',', ' ') || ' F).'); end if;
    -- 5) Licences qui finissent bientôt
    select string_agg(l->>'name', ', ') into v_lic from jsonb_array_elements(s.licences) l
    where ((l->>'startAt')::date + make_interval(months => coalesce((l->>'months')::int, 12)))::date between v_today and v_today + 7;
    if v_lic is not null then v_parts := v_parts || ('Licence à renouveler bientôt : ' || v_lic || '.'); end if;

    if array_length(v_parts, 1) > 0 then
      shop_id := s.id;
      url := case when exists (select 1 from public.repairs r where r.shop_id = s.id) then './?ecran=atelier'
                  when exists (select 1 from public.couture_orders o where o.shop_id = s.id) and v_count = 0 then './?ecran=couture'
                  else './?ecran=stock' end;
      body := left(array_to_string(v_parts, ' '), 200);
      return next;
    end if;
  end loop;
end $$;
revoke all on function private.morning_list() from public;

create or replace function private.morning_watch()
returns integer language plpgsql security definer set search_path to '' as $$
declare r record; v_sent integer := 0;
declare v_day text := to_char(now() at time zone 'Africa/Dakar', 'YYYYMMDD');
begin
  for r in select * from private.morning_list() loop
    perform private.call_notify(jsonb_build_object(
      'kind', 'boutique', 'shop', r.shop_id, 'tag', 'matin-' || v_day,
      'title', 'Bonjour ! Ce qui t''attend aujourd''hui',
      'body', r.body, 'url', r.url));
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end $$;
revoke all on function private.morning_watch() from public;

select cron.unschedule('jokko-rappel-matin') where exists (select 1 from cron.job where jobname = 'jokko-rappel-matin');
select cron.schedule('jokko-rappel-matin', '37 8 * * *', 'select private.morning_watch()');
