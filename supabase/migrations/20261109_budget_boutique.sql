-- Jokko — budget Gemini par boutique et par mois (offres payantes), 9 novembre 2026.
-- Médium 4 000 F → budget 3 000 F ; Avancé 8 000 F → budget 6 000 F (réglables : budget_medium_mois, budget_avance_mois).
-- Une boutique au budget est signalée à Fallou sur la console (une fois par mois) : bon moment pour l'appeler.

insert into private.app_config (key, value) values ('budget_medium_mois', '3000'), ('budget_avance_mois', '6000')
on conflict (key) do nothing;

create or replace function public.use_assistant(p_shop text, p_kind text)
returns json language plpgsql security definer set search_path to '' as $function$
declare
  t text;
  lim int;
  used int;
  total int;
  cap int;
  v_cost numeric;
  k text := case when p_kind = 'direct' then 'echange' else p_kind end;
  today date := (now() at time zone 'Africa/Dakar')::date;
begin
  if not private.is_member(p_shop) then raise exception 'boutique inconnue'; end if;
  if p_kind not in ('direct', 'echange', 'vocal', 'texte', 'conseil', 'stock', 'voix') then raise exception 'type inconnu'; end if;
  if p_kind = 'stock' and not private.is_patron(p_shop) then
    return json_build_object('ok', false, 'tier', null, 'kind', p_kind, 'limit', 0, 'used', 0, 'reason', 'patron');
  end if;
  t := coalesce(private.assistant_tier(p_shop), 'gratuit');

  if private.quota_free() then
    if p_kind <> 'direct' then
      insert into public.assistant_usage (shop_id, day, kind, n) values (p_shop, today, p_kind, 1)
      on conflict (shop_id, day, kind) do update set n = public.assistant_usage.n + 1;
    end if;
    return json_build_object('ok', true, 'tier', t, 'kind', p_kind, 'limit', null, 'used', null);
  end if;

  -- Plafond de sécurité : gratuits et essais en pause si leur dépense du jour dépasse le seuil.
  if t in ('gratuit', 'essai') then
    cap := coalesce((select value::int from private.app_config where key = 'plafond_gratuit_jour'), 500);
    if private.cout_gratuit_jour() >= cap then
      return json_build_object('ok', false, 'tier', t, 'kind', p_kind, 'limit', 0, 'used', 0, 'reason', 'pause');
    end if;
  end if;

  -- Offres payantes : budget Gemini par boutique et par mois. Au-delà, plus de voix (direct, vocal, voix claire,
  -- conseil, stock) jusqu'au mois suivant ; l'écrit continue jusqu'à 125 % du budget.
  if t in ('medium', 'avance') then
    cap := coalesce((select value::int from private.app_config where key = 'budget_' || t || '_mois'), case t when 'avance' then 6000 else 3000 end);
    select coalesce(sum(n * private.assistant_cost(kind)), 0) into v_cost from public.assistant_usage
      where shop_id = p_shop and day >= date_trunc('month', today)::date;
    if (p_kind <> 'texte' and v_cost >= cap) or v_cost >= cap * 1.25 then
      return json_build_object('ok', false, 'tier', t, 'kind', p_kind, 'limit', cap, 'used', round(v_cost), 'reason', 'budget');
    end if;
  end if;

  -- Gratuit : plafond du mois.
  if t = 'gratuit' and p_kind in ('vocal', 'texte', 'voix', 'stock') then
    cap := private.gratuit_mois(p_kind);
    select coalesce(sum(n), 0) into total from public.assistant_usage
      where shop_id = p_shop and kind = p_kind and day >= date_trunc('month', today)::date;
    if total >= cap then
      return json_build_object('ok', false, 'tier', t, 'kind', p_kind, 'limit', cap, 'used', total, 'reason', 'mois');
    end if;
  end if;

  -- Essai : enveloppe totale (sauf stock et voix claire, limités par jour).
  if t = 'essai' and p_kind not in ('stock', 'voix') then
    cap := private.trial_total(k);
    select coalesce(sum(n), 0) into total from public.assistant_usage where shop_id = p_shop and kind = k;
    if total >= cap then
      return json_build_object('ok', false, 'tier', t, 'kind', p_kind, 'limit', cap, 'used', total, 'reason', 'essai');
    end if;
  end if;

  if p_kind = 'direct' then
    lim := private.assistant_limit(t, 'echange');
    select coalesce(n, 0) into used from public.assistant_usage where shop_id = p_shop and day = today and kind = 'echange';
    used := coalesce(used, 0);
    if lim = 0 then return json_build_object('ok', false, 'tier', t, 'kind', p_kind, 'limit', 0, 'used', used, 'reason', 'offre'); end if;
    if used >= lim then return json_build_object('ok', false, 'tier', t, 'kind', p_kind, 'limit', lim, 'used', used, 'reason', 'echanges'); end if;
    return json_build_object('ok', true, 'tier', t, 'kind', p_kind, 'limit', lim, 'used', used);
  end if;

  lim := private.assistant_limit(t, p_kind);
  select n into used from public.assistant_usage where shop_id = p_shop and day = today and kind = p_kind;
  used := coalesce(used, 0);
  if used >= lim then
    return json_build_object('ok', false, 'tier', t, 'kind', p_kind, 'limit', lim, 'used', used,
      'reason', case when lim = 0 then 'offre' when p_kind = 'stock' then 'stock' when p_kind = 'echange' then 'echanges' when p_kind = 'voix' then 'voix' else 'quota' end);
  end if;
  insert into public.assistant_usage (shop_id, day, kind, n) values (p_shop, today, p_kind, 1)
  on conflict (shop_id, day, kind) do update set n = public.assistant_usage.n + 1;
  return json_build_object('ok', true, 'tier', t, 'kind', p_kind, 'limit', lim, 'used', used + 1);
end $function$;

create or replace function private.budget_watch()
returns void language plpgsql security definer set search_path to '' as $$
declare r record; v_month date := date_trunc('month', (now() at time zone 'Africa/Dakar')::date)::date;
begin
  for r in
    select u.shop_id, s.name, private.assistant_tier(u.shop_id) t, sum(u.n * private.assistant_cost(u.kind)) cost
    from public.assistant_usage u join public.shops s on s.id = u.shop_id
    where u.day >= v_month and private.assistant_tier(u.shop_id) in ('medium', 'avance')
    group by u.shop_id, s.name
  loop
    if r.cost >= coalesce((select value::numeric from private.app_config where key = 'budget_' || r.t || '_mois'), case r.t when 'avance' then 6000 else 3000 end)
       and not exists (select 1 from public.admin_events e where e.kind = 'anomalie' and e.meta->>'type' = 'budget'
                       and e.shop_id = r.shop_id and e.at >= v_month) then
      perform private.admin_event('anomalie', 'Budget du mois atteint : ' || r.name,
        'Cette boutique (' || r.t || ') a utilisé ' || round(r.cost) || ' F de Gemini ce mois-ci. Jokko continue à l''écrit jusqu''au mois prochain. Appelle-la : elle utilise beaucoup Jokko.',
        r.shop_id, '{"type":"budget"}'::jsonb, true);
    end if;
  end loop;
end $$;

create or replace function private.credit_watch_all()
returns void language plpgsql security definer set search_path to '' as $$
begin
  perform private.credit_watch();
  perform private.budget_watch();
end $$;

select cron.unschedule('jokko-credit');
select cron.schedule('jokko-credit', '*/5 * * * *', 'select private.credit_watch_all()');
