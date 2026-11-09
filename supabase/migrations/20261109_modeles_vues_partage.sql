-- Nouveaux modèles : 3 vues (face, profil, dos) pour les faire tourner ; partage public d'un modèle sur WhatsApp.
alter table public.couture_models add column if not exists views text[] not null default '{}';

-- Chaque nouveau modèle = 3 photos (≈ 20 F chacune) ; la fabrique en fait 2 par minute.
update private.app_config set value = '60' where key = 'cout_image_galerie';
update private.app_config set value = '2' where key = 'images_par_minute';

-- Page publique d'un modèle (lien envoyé sur WhatsApp) : le modèle et, si le lien vient d'un atelier, son nom et son téléphone.
create or replace function public.modele_public(p_id uuid, p_shop text default null)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'id', m.id, 'titre', m.title, 'habit', m.garment, 'tissu', m.fabric, 'image', m.image_path, 'vues', m.views,
    'atelier', (select s.name from public.shops s where s.id = p_shop),
    'telephone', (select s.phone from public.shops s where s.id = p_shop))
  from public.couture_models m
  where m.id = p_id and m.published;
$$;
revoke all on function public.modele_public(uuid, text) from public;
grant execute on function public.modele_public(uuid, text) to anon, authenticated;
