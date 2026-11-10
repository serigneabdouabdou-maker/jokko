-- Jokko — Supprimer un achat de marchandise retire aussi les articles du stock, 10 novembre 2026.
-- Chaque achat (et chaque perte) garde l'article et la quantité (en unités de gros).
alter table public.expenses add column if not exists product_id text;
alter table public.expenses add column if not exists qty numeric check (qty is null or qty >= 0);
