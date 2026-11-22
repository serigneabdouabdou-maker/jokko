-- Prix donnés aux clients (22/11/2026, demande de Fallou : « noter les clients perdus ») : chaque prix donné dans
-- « Prix pour un client » est noté pris (dépôt fait) ou perdu (raison, prix que le client voulait). 300 au plus,
-- calculs dans l'appli (src/data/quotes.ts) et envoyés au Conseiller.
alter table public.shops add column if not exists quotes jsonb not null default '[]'::jsonb;
