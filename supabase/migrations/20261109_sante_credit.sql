-- Jokko — Santé : le crédit Gemini vide se voit dans l'onglet Santé (9 novembre 2026).
-- Avant : la règle « Gemini » demandait ≥ 3 appels en échec sur 15 min, et la conversation en direct
-- (le téléphone parle directement à Google) n'était jamais comptée en échec : la panne du 09/11 est passée inaperçue.
-- 1. L'appli signale chaque conversation en direct coupée par Google (note_live_failure) → gemini_calls.
-- 2. Un seul 402 (crédit prépayé épuisé) ouvre l'incident « Crédit Gemini (AI Studio) » + notification.
--    Il se ferme tout seul au premier appel réussi après la recharge.

-- 1. Signalement par l'appli (au plus 30 par heure et par boutique)
create or replace function public.note_live_failure(p_shop text, p_code int, p_reason text)
returns void language plpgsql security definer set search_path to '' as $$
declare v_status int;
begin
  if not private.is_member(p_shop) then return; end if;
  if (select count(*) from public.gemini_calls where shop_id = p_shop and kind = 'direct' and not ok and at > now() - interval '1 hour') >= 30 then return; end if;
  v_status := case
    when coalesce(p_reason, '') ~* '(prepay|credit|billing|depleted)' then 402
    when coalesce(p_reason, '') ~* '(quota|resource_exhausted|rate)' then 429
    else coalesce(nullif(p_code, 0), 500) end;
  insert into public.gemini_calls (shop_id, kind, lang, ok, status) values (p_shop, 'direct', null, false, v_status);
end $$;
revoke all on function public.note_live_failure(text, int, text) from public, anon;
grant execute on function public.note_live_failure(text, int, text) to authenticated;

-- 2. Incident « crédit »
create or replace function private.health_label(p text)
returns text language sql stable security definer set search_path to '' as $$
  select coalesce((select label from private.health_list() where target = p),
    case p when 'gemini' then 'Réponses de Gemini' when 'credit' then 'Crédit Gemini (AI Studio)' when 'bugs' then 'Bugs dans l''application' when 'parcours' then 'Connexion et inscription des commerçants' else p end);
$$;

create or replace function private.credit_empty()
returns boolean language sql stable security definer set search_path to '' as $$
  select exists (
    select 1 from public.gemini_calls g
    where g.status = 402 and g.at > now() - interval '6 hours'
      and not exists (select 1 from public.gemini_calls h where h.ok and h.id > g.id)
  );
$$;

create or replace function private.credit_watch()
returns void language plpgsql security definer set search_path to '' as $$
declare
  today date := (now() at time zone 'Africa/Dakar')::date;
  v_cost numeric;
  v_limit numeric;
begin
  perform private.health_set('credit', private.credit_empty(),
    'Crédit prépayé épuisé : Jokko ne peut plus parler. Recharge sur ai.studio/projects → Billing. L''alerte se ferme toute seule après la recharge.');

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

-- 3. admin_health : état du crédit pour la console
do $$
declare v_def text;
begin
  select pg_get_functiondef('public.admin_health()'::regprocedure) into v_def;
  v_def := replace(v_def,
    $o$'gemini', (select jsonb_build_object('calls', count(*), 'fail', count(*) filter (where not ok)) from public.gemini_calls where at > now() - interval '1 hour'),$o$,
    $n$'gemini', (select jsonb_build_object('calls', count(*), 'fail', count(*) filter (where not ok), 'credit_vide', private.credit_empty(), 'dernier_402', (select max(at) from public.gemini_calls where status = 402 and at > now() - interval '6 hours')) from public.gemini_calls where at > now() - interval '1 hour'),$n$);
  if position('credit_vide' in v_def) = 0 then raise exception 'admin_health : remplacement impossible'; end if;
  execute v_def;
end $$;
