-- Boulangerie (10/11/2026) : quantité livrée chaque matin à une boutique cliente ([{ productId, qty }]).
alter table public.clients add column if not exists tournee jsonb not null default '[]'::jsonb;
