-- Studio d'essayage des tailleurs : galerie de modèles (images Jokko) + essayage IA compté (type « image »).
-- Le selfie du client n'est jamais gardé : il part vers Gemini et revient habillé, rien n'est stocké.

-- 1. Galerie commune signée Jokko (lecture pour toutes les boutiques connectées ; écriture par le serveur seulement)
create table if not exists public.couture_models (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null check (category in ('homme', 'femme', 'enfant')),
  garment text not null default '',
  fabric text not null default '',
  image_path text not null,
  thumb_path text,
  published boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.couture_models enable row level security;
drop policy if exists "galerie lisible" on public.couture_models;
create policy "galerie lisible" on public.couture_models for select to authenticated using (published);

insert into storage.buckets (id, name, public)
values ('galerie', 'galerie', true)
on conflict (id) do update set public = true;

-- 2. Jeton interne pour remplir la galerie (jamais affiché ; seul le serveur le compare)
insert into private.app_config (key, value)
values ('galerie_token', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (key) do nothing;

create or replace function public.galerie_token_ok(p_token text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.app_config where key = 'galerie_token' and value = p_token);
$$;
revoke all on function public.galerie_token_ok(text) from public, anon, authenticated;
grant execute on function public.galerie_token_ok(text) to service_role;

-- 3. Essayage = nouveau type compté « image » : 0 pour gratuit et essai, 3/jour Médium, 10/jour Avancé, ~25 F l'image
alter table public.assistant_usage drop constraint if exists assistant_usage_kind_check;
alter table public.assistant_usage add constraint assistant_usage_kind_check
  check (kind in ('direct', 'echange', 'vocal', 'texte', 'conseil', 'stock', 'voix', 'image'));

insert into private.app_config (key, value) values
  ('quota_medium_image', '3'), ('quota_avance_image', '10'), ('quota_gratuit_image', '0'), ('quota_essai_image', '0'), ('cout_image', '25')
on conflict (key) do nothing;

-- use_assistant : accepte « image » (l'essai gratuit n'y a pas droit : quota 0 → raison « offre »)
do $$
declare d text := pg_get_functiondef('public.use_assistant(text,text)'::regprocedure);
begin
  d := replace(d, $q$if p_kind not in ('direct', 'echange', 'vocal', 'texte', 'conseil', 'stock', 'voix') then$q$,
                  $q$if p_kind not in ('direct', 'echange', 'vocal', 'texte', 'conseil', 'stock', 'voix', 'image') then$q$);
  d := replace(d, $q$if t = 'essai' and p_kind not in ('stock', 'voix') then$q$,
                  $q$if t = 'essai' and p_kind not in ('stock', 'voix', 'image') then$q$);
  if position($q$'voix', 'image')$q$ in d) = 0 then raise exception 'use_assistant : texte inattendu'; end if;
  execute d;
end $$;
