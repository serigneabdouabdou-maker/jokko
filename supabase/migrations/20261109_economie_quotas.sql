-- Jokko — économie du crédit Gemini (9 novembre 2026)
-- 1. Offre gratuite : petite limite par jour ET plafond par mois (avant : 10 vocaux + 20 écrits par jour, sans fin).
-- 2. Conversation en direct : chaque échange compte dans la limite du jour, même au milieu d'une conversation.
-- 3. Voix claire (« speak ») et lecture du stock : comptées et limitées par offre (avant : illimitées).
-- 4. Plafond de sécurité : si les comptes gratuits + essais dépassent X F de Gemini dans la journée,
--    ils sont mis en pause jusqu'au lendemain. Les clients payants ne sont jamais coupés.
-- Tous les chiffres se changent dans private.app_config, sans toucher au code.

-- Le compteur refusait « stock » (la lecture du stock échouait) : on ajoute stock et voix.
alter table public.assistant_usage drop constraint if exists assistant_usage_kind_check;
alter table public.assistant_usage add constraint assistant_usage_kind_check
  check (kind = any (array['direct', 'echange', 'vocal', 'texte', 'conseil', 'stock', 'voix']));

insert into private.app_config (key, value) values
  -- Gratuit : par jour
  ('quota_gratuit_vocal', '5'),
  ('quota_gratuit_texte', '10'),
  ('quota_gratuit_voix', '20'),
  ('quota_gratuit_stock', '3'),
  -- Gratuit : par mois
  ('gratuit_mois_vocal', '30'),
  ('gratuit_mois_texte', '60'),
  ('gratuit_mois_voix', '60'),
  ('gratuit_mois_stock', '10'),
  -- Essai : stock et voix claire
  ('quota_essai_stock', '20'),
  ('quota_essai_voix', '100'),
  -- Payants : voix claire (une phrase lue = 1)
  ('quota_medium_voix', '200'),
  ('quota_avance_voix', '400'),
  -- Coût estimé (F CFA) pour le tableau de bord
  ('cout_voix', '1'),
  ('cout_stock', '3'),
  -- Plafond de sécurité quotidien des comptes gratuits + essais (F CFA)
  ('plafond_gratuit_jour', '500')
on conflict (key) do nothing;

create or replace function private.gratuit_mois(p_kind text)
returns integer language sql stable security definer set search_path to '' as $$
  select coalesce((select value::int from private.app_config where key = 'gratuit_mois_' || p_kind),
    case p_kind when 'vocal' then 30 when 'texte' then 60 when 'voix' then 60 when 'stock' then 10 else 0 end);
$$;

-- Dépense estimée du jour (F) des boutiques gratuites et en essai.
create or replace function private.cout_gratuit_jour()
returns numeric language sql stable security definer set search_path to '' as $$
  select coalesce(sum(u.n * private.assistant_cost(u.kind)), 0)
  from public.assistant_usage u
  where u.day = (now() at time zone 'Africa/Dakar')::date
    and coalesce(private.assistant_tier(u.shop_id), 'gratuit') in ('gratuit', 'essai');
$$;

create or replace function public.use_assistant(p_shop text, p_kind text)
returns json language plpgsql security definer set search_path to '' as $function$
declare
  t text;
  lim int;
  used int;
  total int;
  cap int;
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

-- ---------- Alertes pour Fallou (notification sur la console, toutes les 5 minutes) ----------
-- 1. Crédit Gemini vide (erreur 402 de Google) : alerte tout de suite, au plus une fois toutes les 2 heures.
-- 2. Plafond gratuit atteint : les comptes gratuits/essais sont en pause jusqu'à demain (une alerte par jour).
-- 3. Dépense du jour au-dessus de alerte_cout_jour (F) : une alerte par jour.
insert into private.app_config (key, value) values ('alerte_cout_jour', '1500') on conflict (key) do nothing;

create or replace function private.credit_watch()
returns void language plpgsql security definer set search_path to '' as $$
declare
  today date := (now() at time zone 'Africa/Dakar')::date;
  v_cost numeric;
  v_limit numeric;
begin
  if exists (select 1 from public.gemini_calls where status = 402 and at > now() - interval '15 minutes')
     and not exists (select 1 from public.admin_events where kind = 'anomalie' and meta->>'type' = 'credit' and at > now() - interval '2 hours') then
    perform private.admin_event('anomalie', 'Crédit Gemini épuisé',
      'Jokko ne peut plus parler. Recharge le crédit sur ai.studio/projects → Billing. Ça repart tout seul après.', null, '{"type":"credit"}'::jsonb, true);
  end if;

  v_limit := coalesce((select value::numeric from private.app_config where key = 'plafond_gratuit_jour'), 500);
  if private.cout_gratuit_jour() >= v_limit
     and not exists (select 1 from public.admin_events where kind = 'anomalie' and meta->>'type' = 'plafond' and (at at time zone 'Africa/Dakar')::date = today) then
    perform private.admin_event('anomalie', 'Comptes gratuits en pause',
      'Les comptes gratuits et essais ont atteint ' || v_limit || ' F de Gemini aujourd''hui. Pause jusqu''à demain. Les clients payants continuent.', null, '{"type":"plafond"}'::jsonb, true);
  end if;

  select coalesce(sum(n * private.assistant_cost(kind)), 0) into v_cost from public.assistant_usage where day = today;
  v_limit := coalesce((select value::numeric from private.app_config where key = 'alerte_cout_jour'), 1500);
  if v_cost >= v_limit
     and not exists (select 1 from public.admin_events where kind = 'anomalie' and meta->>'type' = 'cout' and (at at time zone 'Africa/Dakar')::date = today) then
    perform private.admin_event('anomalie', 'Dépense Gemini élevée',
      'Déjà ' || round(v_cost) || ' F de Gemini aujourd''hui (seuil ' || v_limit || ' F). Regarde la console, onglet Usage.', null, '{"type":"cout"}'::jsonb, true);
  end if;
end $$;

select cron.schedule('jokko-credit', '*/5 * * * *', 'select private.credit_watch()');
