-- Jokko — appli hybride : modules ajoutés par le patron en plus de ceux de son métier (9 novembre 2026).
-- Ex. une boutique d'alimentation qui fait aussi du transfert d'argent coche « services ».
alter table public.shops add column if not exists modules text[] not null default '{}';
alter table public.shops drop constraint if exists shops_modules_check;
alter table public.shops add constraint shops_modules_check
  check (modules <@ array['atelier', 'couture', 'peremption', 'vivres', 'services']::text[] and cardinality(modules) <= 10);
