-- Jokko — Dettes remboursées dans la caisse du jour, 10 novembre 2026.
-- Quand un client rembourse (bouton « Il a payé » ou à la voix), l'argent est noté ici :
-- en espèces, il entre dans la caisse attendue du soir ; Wave / Orange Money sont montrés à part.
-- Mêmes règles que les ventes : l'auteur est le compte connecté ; on peut annuler sa propre
-- ligne dans les 10 minutes, le patron peut tout corriger.

create table if not exists public.debt_payments (
  id text primary key,
  shop_id text not null references public.shops(id) on delete cascade,
  at timestamptz not null default now(),
  client_id text not null default '',
  client_name text not null default '',
  amount bigint not null default 0 check (amount >= 0),
  payment text not null default 'especes' check (payment in ('especes', 'wave', 'om')),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists debt_payments_shop_at on public.debt_payments (shop_id, at desc);

alter table public.debt_payments enable row level security;
drop policy if exists "membre: lire" on public.debt_payments;
drop policy if exists "membre: ajouter" on public.debt_payments;
drop policy if exists "patron: modifier" on public.debt_payments;
drop policy if exists "annuler: patron, ou sa ligne recente" on public.debt_payments;
create policy "membre: lire" on public.debt_payments for select using (private.is_member(shop_id));
create policy "membre: ajouter" on public.debt_payments for insert with check (private.is_member(shop_id));
create policy "patron: modifier" on public.debt_payments for update using (private.is_patron(shop_id)) with check (private.is_patron(shop_id));
create policy "annuler: patron, ou sa ligne recente" on public.debt_payments for delete
  using (private.is_patron(shop_id) or (created_by = (select auth.uid()) and created_at > now() - interval '10 minutes'));

drop trigger if exists debt_payments_author on public.debt_payments;
create trigger debt_payments_author before insert on public.debt_payments for each row execute function private.stamp_author();
