-- Jokko — une seule demande d'abonnement en attente par boutique (9 novembre 2026).
-- Avant : chaque toucher sur « Payer » créait une nouvelle demande (doublons dans la console).
-- Maintenant : tant qu'une demande est en attente, on la réutilise (même référence).
--  - pas encore payée (« J'ai payé » pas touché) : on peut changer l'offre ou la durée, la référence reste ;
--  - déjà déclarée payée : plus aucun changement, on attend la validation de CFC.
-- Après validation (active) ou refus, une nouvelle demande (prolonger, autre offre) est possible.

-- Doublons déjà présents : on garde la plus récente, les autres sont refusées.
update public.subscription_requests r set status = 'refusee', note = coalesce(note, '') || ' doublon fermé automatiquement'
where r.status = 'en_attente' and exists (
  select 1 from public.subscription_requests o where o.shop_id = r.shop_id and o.status = 'en_attente' and o.created_at > r.created_at);

create unique index if not exists subscription_requests_one_pending on public.subscription_requests (shop_id) where status = 'en_attente';

create or replace function public.request_subscription(p_shop text, p_plan text, p_months integer, p_payer text)
returns json language plpgsql security definer set search_path to '' as $function$
declare v_price int; v_ref text; v_id uuid; r public.subscription_requests;
begin
  if not private.is_patron(p_shop) then raise exception 'réservé au patron'; end if;
  if p_plan not in ('medium', 'avance') or p_months not between 1 and 12 then raise exception 'demande invalide'; end if;
  v_price := (select value::int from private.app_config where key = 'price_' || p_plan);

  select * into r from public.subscription_requests where shop_id = p_shop and status = 'en_attente' order by created_at desc limit 1;
  if r.id is not null then
    if r.declared_at is not null or r.paid_at is not null then
      return json_build_object('id', r.id, 'reference', r.reference, 'amount', r.amount, 'plan', r.plan, 'months', r.months, 'deja', true, 'declare', true);
    end if;
    update public.subscription_requests
      set plan = p_plan, months = p_months, amount = v_price * p_months,
          -- Montant changé : l'ancien lien de paiement en ligne ne vaut plus.
          wave_session = case when amount = v_price * p_months then wave_session end,
          wave_url = case when amount = v_price * p_months then wave_url end,
          provider_token = case when amount = v_price * p_months then provider_token end,
          payer_phone = coalesce(nullif(left(coalesce(p_payer, ''), 20), ''), payer_phone)
      where id = r.id;
    return json_build_object('id', r.id, 'reference', r.reference, 'amount', v_price * p_months, 'plan', p_plan, 'months', p_months, 'deja', true, 'declare', false);
  end if;

  v_ref := 'JK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  begin
    insert into public.subscription_requests (shop_id, plan, months, amount, reference, payer_phone)
    values (p_shop, p_plan, p_months, v_price * p_months, v_ref, left(coalesce(p_payer, ''), 20))
    returning id into v_id;
  exception when unique_violation then
    -- Deux touchers en même temps : l'autre demande vient d'être créée, on la renvoie.
    select * into r from public.subscription_requests where shop_id = p_shop and status = 'en_attente' limit 1;
    return json_build_object('id', r.id, 'reference', r.reference, 'amount', r.amount, 'plan', r.plan, 'months', r.months, 'deja', true, 'declare', r.declared_at is not null);
  end;
  return json_build_object('id', v_id, 'reference', v_ref, 'amount', v_price * p_months, 'plan', p_plan, 'months', p_months, 'deja', false, 'declare', false);
end $function$;
