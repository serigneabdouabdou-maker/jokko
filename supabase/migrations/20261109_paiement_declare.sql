-- Jokko — paiement Wave manuel : le patron touche « J'ai payé » → Fallou reçoit une notification sur son téléphone
-- (9 novembre 2026). Le paiement Wave automatique n'est pas branché (wave_auto = false) : sans ce bouton,
-- CFC n'apprenait le paiement qu'en regardant son Wave.
alter table public.subscription_requests add column if not exists declared_at timestamptz;

create or replace function public.declare_subscription_paid(p_request uuid, p_transaction text)
returns json language plpgsql security definer set search_path to '' as $$
declare r public.subscription_requests; v_shop text; v_tx text := nullif(left(trim(coalesce(p_transaction, '')), 40), '');
begin
  select * into r from public.subscription_requests where id = p_request;
  if r.id is null or not private.is_patron(r.shop_id) then raise exception 'réservé au patron'; end if;
  if r.status <> 'en_attente' then return json_build_object('ok', true, 'status', r.status); end if;
  -- Un seul rappel toutes les 10 minutes (sauf s'il ajoute le numéro de transaction).
  if r.declared_at is not null and r.declared_at > now() - interval '10 minutes' and (v_tx is null or v_tx = r.transaction_id) then
    return json_build_object('ok', true, 'status', r.status, 'deja', true);
  end if;
  update public.subscription_requests set declared_at = now(), transaction_id = coalesce(v_tx, transaction_id) where id = r.id;
  v_shop := coalesce((select name from public.shops where id = r.shop_id), 'Une boutique');
  perform private.admin_event('paiement', 'Paiement Wave à vérifier : ' || replace(to_char(r.amount, 'FM999G999G999'), ',', ' ') || ' F',
    v_shop || ' dit avoir payé l''offre ' || private.plan_label(r.plan) || ' ' || r.months || ' mois. Réf ' || r.reference ||
    coalesce(' · n° ' || coalesce(v_tx, r.transaction_id), '') || coalesce(' · Wave ' || nullif(r.payer_phone, ''), '') ||
    '. Vérifie ton Wave puis active dans la console.',
    r.shop_id, jsonb_build_object('type', 'declare', 'request', r.id, 'amount', r.amount), true);
  return json_build_object('ok', true, 'status', r.status);
end $$;
revoke all on function public.declare_subscription_paid(uuid, text) from public, anon;
grant execute on function public.declare_subscription_paid(uuid, text) to authenticated;
