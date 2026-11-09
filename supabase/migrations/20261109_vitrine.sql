-- Vitrine : la page publique de chaque entreprise (jokkoapp.com/?v=<code>) à mettre en statut WhatsApp, sur Facebook ou TikTok.
-- Le patron choisit les articles montrés (avec photo et prix) ; le tailleur y met aussi des modèles du Studio.
-- Le client regarde sans compte et commande sur WhatsApp.

alter table public.products add column if not exists photo_path text;
alter table public.products add column if not exists vitrine boolean not null default false;

create table if not exists public.vitrines (
  shop_id text primary key references public.shops(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  open boolean not null default true,
  bio text not null default '',
  models uuid[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.vitrines enable row level security;
create policy "vitrine: membres lisent" on public.vitrines for select to authenticated using (private.is_member(shop_id));

-- Photos des articles : stockage public « vitrine », un dossier par entreprise (les membres y déposent leurs photos).
insert into storage.buckets (id, name, public) values ('vitrine', 'vitrine', true) on conflict (id) do update set public = true;
create policy "vitrine: membres déposent" on storage.objects for insert to authenticated
  with check (bucket_id = 'vitrine' and private.is_member((storage.foldername(name))[1]));
create policy "vitrine: membres remplacent" on storage.objects for update to authenticated
  using (bucket_id = 'vitrine' and private.is_member((storage.foldername(name))[1]));

-- Ouvrir / régler sa vitrine (patron) : crée le code court la première fois (nom de l'entreprise + 3 lettres).
create or replace function public.vitrine_save(p_shop text, p_open boolean default null, p_bio text default null, p_models uuid[] default null)
returns json language plpgsql security definer set search_path = '' as $$
declare s record; v record; base text; code text;
begin
  if not private.is_patron(p_shop) then raise exception 'réservé au patron'; end if;
  select * into v from public.vitrines where shop_id = p_shop;
  if not found then
    select name into s from public.shops where id = p_shop;
    base := trim(both '-' from regexp_replace(lower(translate(coalesce(s.name, 'vitrine'),
      'àâäáãçéèêëíìîïñóòôöõúùûüýÿ', 'aaaaaceeeeiiiinooooouuuuyy')), '[^a-z0-9]+', '-', 'g'));
    base := left(nullif(base, ''), 28);
    loop
      code := coalesce(base, 'vitrine') || '-' || substr(md5(random()::text), 1, 3);
      exit when not exists (select 1 from public.vitrines where slug = code);
    end loop;
    insert into public.vitrines (shop_id, slug) values (p_shop, code) returning * into v;
  end if;
  update public.vitrines set
    open = coalesce(p_open, open),
    bio = coalesce(left(p_bio, 280), bio),
    models = coalesce(p_models[1:60], models),
    updated_at = now()
  where shop_id = p_shop returning * into v;
  return json_build_object('slug', v.slug, 'open', v.open, 'bio', v.bio, 'models', v.models);
end $$;
revoke all on function public.vitrine_save(text, boolean, text, uuid[]) from public, anon;
grant execute on function public.vitrine_save(text, boolean, text, uuid[]) to authenticated;

-- La vitrine publique (sans compte) : l'entreprise, ses articles en vitrine, ses modèles.
create or replace function public.vitrine_public(p_slug text)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'nom', s.name, 'metier', s.activity, 'ville', s.city, 'telephone', s.phone, 'bio', v.bio, 'shop', s.id,
    'articles', coalesce((select json_agg(json_build_object('id', p.id, 'nom', p.name, 'prix', p.price, 'unite', p.unit, 'photo', p.photo_path, 'dispo', p.stock > 0) order by p.name)
      from public.products p where p.shop_id = s.id and p.vitrine), '[]'::json),
    'modeles', coalesce((select json_agg(json_build_object('id', m.id, 'titre', m.title, 'habit', m.garment, 'tissu', m.fabric, 'image', m.image_path, 'vignette', m.thumb_path, 'vues', m.views))
      from public.couture_models m where m.id = any(v.models) and m.published), '[]'::json))
  from public.vitrines v join public.shops s on s.id = v.shop_id
  where v.slug = lower(p_slug) and v.open;
$$;
revoke all on function public.vitrine_public(text) from public;
grant execute on function public.vitrine_public(text) to anon, authenticated;
