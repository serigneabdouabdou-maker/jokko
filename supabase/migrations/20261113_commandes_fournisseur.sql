-- Liste « À commander » chez le fournisseur (demande de Fallou, 13/11/2026) : pièces cherchées sans résultat,
-- pièces qui manquent, conseils de Jokko gardés par le patron. Le reste (stock bas, pièces qui partent vite,
-- pièces des appareils au dépôt) est calculé dans l'appli (src/data/reorder.ts).
alter table public.shops add column if not exists to_order jsonb not null default '[]'::jsonb;
