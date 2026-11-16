-- D'où vient l'argent d'une sortie (16/11/2026, règle de Fallou) : seul « tiroir » (ou vide) baisse la caisse attendue.
alter table public.expenses add column if not exists paid_with text;
do $$ begin
  alter table public.expenses add constraint expenses_paid_with_check check (paid_with is null or paid_with in ('tiroir', 'wave', 'om', 'autre'));
exception when duplicate_object then null; end $$;
