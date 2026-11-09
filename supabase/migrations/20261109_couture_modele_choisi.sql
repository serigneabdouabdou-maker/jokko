-- Commande passée depuis le Studio : le modèle choisi (image de la galerie) suit la commande et s'affiche sur le lien de suivi.
alter table public.couture_orders add column if not exists model_path text not null default '';

create or replace function public.suivi_couture(p_token text)
returns json language sql stable security definer set search_path to '' as $$
  select json_build_object(
    'boutique', s.name, 'telephone', s.phone, 'numero', o.number, 'client', split_part(o.client_name, ' ', 1),
    'modele', o.garment, 'etape', o.status, 'date_prevue', o.due_at, 'reste', greatest(o.price - o.paid, 0),
    'pret_le', o.ready_at, 'livre_le', o.delivered_at, 'commande_le', o.at, 'image', nullif(o.model_path, ''))
  from public.couture_orders o join public.shops s on s.id = o.shop_id
  where length(coalesce(p_token, '')) >= 12 and o.token = p_token;
$$;
