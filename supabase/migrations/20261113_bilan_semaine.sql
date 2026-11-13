-- Bilan de la semaine, chaque dimanche à 20 h 17 (Dakar) (demande de Fallou, 13/11/2026) : notification au patron.
-- Semaine = lundi 0 h → maintenant, comparée à la semaine d'avant (même règle de bénéfice que l'appli, src/data/report.ts :
-- ventes − prix d'achat connu ; paiements de réparation, couture et services comptés en entier ; − dépenses − pertes).
-- Réparateur : les 3 réparations qui ont le plus rapporté (prix − pièces) et la pièce la plus posée.
-- Autres métiers : les 3 articles qui ont le plus rapporté. Rien vendu en deux semaines = rien envoyé.

drop function if exists private.week_profit(text, timestamptz, timestamptz);
create or replace function private.week_profit(p_shop text, p_from timestamptz, p_to timestamptz)
returns table (revenue bigint, net bigint, sales int, unknown bigint)
language sql stable security definer set search_path to '' as $$
  with s as (
    select v.amount, v.cost, v.product_id, v.label from public.sales v
    where v.shop_id = p_shop and v.at >= p_from and v.at < p_to
  ),
  e as (
    select coalesce(sum(x.amount) filter (where coalesce(x.kind, 'depense') = 'depense'), 0) as spent,
           coalesce(sum(x.amount) filter (where x.kind = 'perte'), 0) as lost
    from public.expenses x where x.shop_id = p_shop and x.at >= p_from and x.at < p_to
  )
  select coalesce(sum(s.amount), 0)::bigint,
         (coalesce(sum(case when s.cost is not null then s.amount - s.cost
                            when s.product_id is null and s.label ~ '^(Couture C-|Réparation R-|Service · )' then s.amount
                            else 0 end), 0) - (select spent + lost from e))::bigint,
         count(*)::int,
         coalesce(sum(s.amount) filter (where s.cost is null and not (s.product_id is null and s.label ~ '^(Couture C-|Réparation R-|Service · )')), 0)::bigint
  from s
$$;
revoke all on function private.week_profit(text, timestamptz, timestamptz) from public;

create or replace function private.week_list()
returns table (shop_id text, title text, body text)
language plpgsql stable security definer set search_path to '' as $$
declare
  sh record;
  v_monday timestamptz := (date_trunc('week', now() at time zone 'Africa/Dakar')) at time zone 'Africa/Dakar';
  w record;
  p record;
  v_parts text[];
  v_top text;
  v_part text;
  v_pct int;
begin
  for sh in select s.id, s.name from public.shops s where s.deleted_at is null loop
    select * into w from private.week_profit(sh.id, v_monday, now());
    select * into p from private.week_profit(sh.id, v_monday - interval '7 days', v_monday);
    continue when w.sales = 0 and p.sales = 0;
    if w.sales = 0 then
      v_parts := array['Aucune vente notée cette semaine (la semaine d''avant : ' || p.sales || ' vente' || case when p.sales > 1 then 's' else '' end || ').'];
    elsif w.unknown * 2 > w.revenue then
      -- Prix d'achat pas notés : le bénéfice serait faux, on donne les ventes.
      v_parts := array['Ventes cette semaine : ' || replace(to_char(w.revenue, 'FM999G999G999'), ',', ' ') || ' F (' || w.sales || ' vente' || case when w.sales > 1 then 's' else '' end || ')'
        || case when p.revenue > 0 then ', ' || case when w.revenue >= p.revenue then '+' else '−' end || abs(round((w.revenue - p.revenue) * 100.0 / p.revenue))::int || ' % sur la semaine d''avant' else '' end
        || '. Mets les prix d''achat dans Stock pour voir ton bénéfice.'];
    else
      v_parts := array[(case when w.net < 0 then 'Perte de la semaine : ' else 'Gagné cette semaine : ' end)
        || replace(to_char(abs(w.net), 'FM999G999G999'), ',', ' ') || ' F (' || w.sales || ' vente' || case when w.sales > 1 then 's' else '' end || ')'
        || case when p.sales > 0 and p.net > 0 then
             ', ' || case when w.net >= p.net then '+' else '−' end
             || abs(round((w.net - p.net) * 100.0 / p.net))::int || ' % sur la semaine d''avant'
           else '' end || '.'];
    end if;
    if exists (select 1 from public.repairs r where r.shop_id = sh.id) then
      select string_agg(t.device || ' (' || replace(to_char(t.labor, 'FM999G999G999'), ',', ' ') || ')', ', ') into v_top from (
        select r.device, r.price - coalesce((select sum(coalesce((x->>'cost')::numeric, 0) * coalesce(nullif(x->>'qty', '')::numeric, 1)) from jsonb_array_elements(r.parts) x), 0) as labor
        from public.repairs r where r.shop_id = sh.id and r.status = 'rendu' and r.returned_at >= v_monday
        order by 2 desc limit 3
      ) t;
      if v_top is not null then v_parts := v_parts || ('Top réparations : ' || v_top || '.'); end if;
      select x->>'label' || ' (' || count(*) || ')' into v_part from public.repairs r, jsonb_array_elements(r.parts) x
      where r.shop_id = sh.id and coalesce(r.repaired_at, r.at) >= v_monday and r.status <> 'annule'
      group by x->>'label' order by count(*) desc limit 1;
      if v_part is not null then v_parts := v_parts || ('Pièce la plus posée : ' || v_part || '.'); end if;
    else
      select string_agg(t.label, ', ') into v_top from (
        select v.label, sum(v.amount - coalesce(v.cost, 0)) as g from public.sales v
        where v.shop_id = sh.id and v.at >= v_monday and v.product_id is not null
        group by v.label order by 2 desc limit 3
      ) t;
      if v_top is not null then v_parts := v_parts || ('Ce qui rapporte le plus : ' || v_top || '.'); end if;
    end if;
    shop_id := sh.id;
    title := left('Ta semaine · ' || sh.name, 80);
    body := left(array_to_string(v_parts, ' '), 200);
    return next;
  end loop;
end $$;
revoke all on function private.week_list() from public;

create or replace function private.week_watch()
returns integer language plpgsql security definer set search_path to '' as $$
declare r record; v_sent integer := 0;
declare v_week text := to_char(date_trunc('week', now() at time zone 'Africa/Dakar'), 'YYYYMMDD');
begin
  for r in select * from private.week_list() loop
    perform private.call_notify(jsonb_build_object('kind', 'boutique', 'shop', r.shop_id, 'tag', 'semaine-' || v_week, 'title', r.title, 'body', r.body, 'url', './?ecran=bilan'));
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end $$;
revoke all on function private.week_watch() from public;

select cron.unschedule('jokko-bilan-semaine') where exists (select 1 from cron.job where jobname = 'jokko-bilan-semaine');
select cron.schedule('jokko-bilan-semaine', '17 20 * * 0', 'select private.week_watch()');
