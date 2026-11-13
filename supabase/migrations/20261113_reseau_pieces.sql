-- Réseau Jokko des pièces (13/11/2026, demande de Fallou) : base commune à tous les réparateurs,
-- qui s'enrichit toute seule avec les listes des fournisseurs, les réparations faites et ce que les ateliers apprennent.
-- Aucune donnée de client : seulement des modèles de téléphone (« bf6 », « sparkgo2023 ») et des types de pièce.

create table if not exists public.compat_links (
  a text not null,
  b text not null,
  kind text not null,
  source text not null check (source in ('fournisseur', 'pose', 'atelier')),
  shop_id text not null,
  created_at timestamptz not null default now(),
  primary key (a, b, kind, source, shop_id),
  check (a < b)
);
create index if not exists compat_links_b on public.compat_links (b);
alter table public.compat_links enable row level security;

-- Codes IMEI appris par les ateliers (8 premiers chiffres seulement, jamais l'IMEI entier).
create table if not exists public.compat_tac (
  tac text not null check (tac ~ '^\d{8}$'),
  model text not null,
  label text not null,
  shop_id text not null,
  created_at timestamptz not null default now(),
  primary key (tac, model, shop_id)
);
alter table public.compat_tac enable row level security;

/**
 * p_families : [{ "kind": "Écran", "source": "pose", "models": ["bf6","bf7","ki5k"] }, …]
 * Chaque famille relie ses modèles deux à deux (« même écran »). Une boutique compte une seule fois par lien.
 */
create or replace function public.compat_learn(p_shop text, p_families jsonb)
returns int
language plpgsql
security definer
set search_path to ''
as $$
declare
  f jsonb;
  models text[];
  n int := 0;
  added int;
begin
  if not private.is_member(p_shop) or jsonb_typeof(p_families) <> 'array' then return 0; end if;
  for f in select * from jsonb_array_elements(p_families) limit 300 loop
    if coalesce(f->>'kind', '') not in ('Écran', 'Batterie', 'Plaquette', 'Dos', 'Connecteur', 'Bouton', 'Nappe')
       or coalesce(f->>'source', '') not in ('fournisseur', 'pose', 'atelier')
       or jsonb_typeof(f->'models') <> 'array' then
      continue;
    end if;
    select array_agg(distinct m) into models
    from (select value as m from jsonb_array_elements_text(f->'models') limit 30) x
    where m ~ '^[a-z0-9]{2,24}$';
    if models is null or array_length(models, 1) < 2 then continue; end if;
    insert into public.compat_links (a, b, kind, source, shop_id)
    select x.m, y.m, f->>'kind', f->>'source', p_shop
    from unnest(models) x(m), unnest(models) y(m)
    where x.m < y.m
    on conflict do nothing;
    get diagnostics added = row_count;
    n := n + added;
  end loop;
  return n;
end $$;

/** Modèles qui partagent une pièce avec ceux demandés, avec le nombre d'ateliers par source. */
create or replace function public.compat_lookup(p_keys text[])
returns table (model text, other text, kind text, poses int, fournisseurs int, ateliers int)
language sql
stable
security definer
set search_path to ''
as $$
  with k as (select distinct x from unnest(p_keys[1:12]) x where x ~ '^[a-z0-9]{2,24}$'),
  l as (
    select a as model, b as other, kind, source, shop_id from public.compat_links where a in (select x from k)
    union all
    select b, a, kind, source, shop_id from public.compat_links where b in (select x from k)
  )
  select model, other, kind,
    count(distinct shop_id) filter (where source = 'pose')::int,
    count(distinct shop_id) filter (where source = 'fournisseur')::int,
    count(distinct shop_id) filter (where source = 'atelier')::int
  from l
  where auth.uid() is not null
  group by model, other, kind
  order by 4 desc, 5 desc, 6 desc
  limit 80
$$;

create or replace function public.compat_tac_learn(p_shop text, p_tac text, p_model text, p_label text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not private.is_member(p_shop) or p_tac !~ '^\d{8}$' or p_model !~ '^[a-z0-9]{2,24}$' then return; end if;
  insert into public.compat_tac (tac, model, label, shop_id)
  values (p_tac, p_model, left(trim(coalesce(p_label, p_model)), 60), p_shop)
  on conflict do nothing;
end $$;

create or replace function public.compat_tac_lookup(p_tac text)
returns table (model text, label text, ateliers int)
language sql
stable
security definer
set search_path to ''
as $$
  select model, min(label), count(distinct shop_id)::int
  from public.compat_tac
  where tac = p_tac and auth.uid() is not null
  group by model
  order by 3 desc
  limit 5
$$;

revoke all on function public.compat_learn(text, jsonb) from public, anon;
revoke all on function public.compat_lookup(text[]) from public, anon;
revoke all on function public.compat_tac_learn(text, text, text, text) from public, anon;
revoke all on function public.compat_tac_lookup(text) from public, anon;
grant execute on function public.compat_learn(text, jsonb) to authenticated;
grant execute on function public.compat_lookup(text[]) to authenticated;
grant execute on function public.compat_tac_learn(text, text, text, text) to authenticated;
grant execute on function public.compat_tac_lookup(text) to authenticated;
