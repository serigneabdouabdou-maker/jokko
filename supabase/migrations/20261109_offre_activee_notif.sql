-- Jokko — le client est prévenu sur son téléphone quand son offre est activée (ou refusée), 9 novembre 2026.
-- Marche pour la validation à la main dans la console (admin_decide) et pour les paiements automatiques.
create or replace function private.on_subscription_decided()
returns trigger language plpgsql security definer set search_path to '' as $$
-- La boutique est mise à jour juste après la demande : on calcule la nouvelle date comme admin_decide.
declare v_until timestamptz := (select greatest(coalesce(plan_until, now()), now()) + make_interval(months => new.months) from public.shops where id = new.shop_id);
begin
  if old.status = 'en_attente' and new.status = 'active' then
    perform private.call_notify(jsonb_build_object('kind', 'boutique', 'shop', new.shop_id, 'tag', 'offre-' || left(new.id::text, 8),
      'title', 'Ton offre ' || private.plan_label(new.plan) || ' est activée ✓',
      'body', 'Merci ! Paiement de ' || replace(to_char(new.amount, 'FM999G999G999'), ',', ' ') || ' F reçu (réf ' || new.reference || '). Jokko est à toi' ||
              coalesce(' jusqu''au ' || to_char(v_until at time zone 'Africa/Dakar', 'DD/MM/YYYY'), '') || '.'));
  elsif old.status = 'en_attente' and new.status = 'refusee' and coalesce(new.note, '') not like '%doublon%' then
    perform private.call_notify(jsonb_build_object('kind', 'boutique', 'shop', new.shop_id, 'tag', 'offre-' || left(new.id::text, 8),
      'title', 'Paiement non trouvé',
      'body', 'CFC n''a pas trouvé ton paiement (réf ' || new.reference || '). Écris-nous sur WhatsApp au 77 567 47 25 avec la capture du paiement Wave.'));
  end if;
  return null;
end $$;

drop trigger if exists subscription_requests_decided on public.subscription_requests;
create trigger subscription_requests_decided after update of status on public.subscription_requests
for each row execute function private.on_subscription_decided();
