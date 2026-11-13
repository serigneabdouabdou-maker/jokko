-- Réparateurs (13/11/2026, demande de Fallou) : services sans pièce (décodage, configuration, création de compte…)
-- et licences des outils de décodage (payées d'un coup, réparties sur leur durée dans les bénéfices).
alter table public.shops add column if not exists services jsonb not null default '[]'::jsonb;
alter table public.shops add column if not exists licences jsonb not null default '[]'::jsonb;
-- Service fait avec une licence : pour savoir ce que la licence a rapporté.
alter table public.sales add column if not exists licence_id text;
