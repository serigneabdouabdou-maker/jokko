-- Jokko — Transfert d'argent (Wave, Orange Money, Free Money…), 23 novembre 2026.
-- Chaque opération du point de transfert (dépôt, retrait, paiement, recharge, versement, commission, apport, sortie,
-- comptage) est une ligne. Les soldes attendus et l'écart du soir sont calculés dans l'appli (src/data/mobileMoney.ts).
-- Jamais de pièce d'identité ici : seulement le nom et le numéro du client s'ils sont donnés.
-- Mêmes règles que les remboursements : l'auteur est le compte connecté ; on annule sa propre ligne dans les 10 minutes,
-- le patron peut tout corriger.

alter table public.shops add column if not exists mm_conf jsonb not null default '{}'::jsonb;

create table if not exists public.mm_ops (
  id text primary key,
  shop_id text not null references public.shops(id) on delete cascade,
  at timestamptz not null default now(),
  operator text not null default '',
  kind text not null check (kind in ('depot', 'retrait', 'paiement', 'recharge', 'versement', 'commission', 'apport', 'sortie', 'comptage')),
  amount bigint not null default 0 check (amount >= 0),
  commission bigint not null default 0 check (commission >= 0),
  fee bigint not null default 0 check (fee >= 0),
  source text not null default '',
  client text not null default '',
  phone text not null default '',
  note text not null default '',
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists mm_ops_shop_at on public.mm_ops (shop_id, at desc);

alter table public.mm_ops enable row level security;
drop policy if exists "membre: lire" on public.mm_ops;
drop policy if exists "membre: ajouter" on public.mm_ops;
drop policy if exists "patron: modifier" on public.mm_ops;
drop policy if exists "annuler: patron, ou sa ligne recente" on public.mm_ops;
create policy "membre: lire" on public.mm_ops for select using (private.is_member(shop_id));
create policy "membre: ajouter" on public.mm_ops for insert with check (private.is_member(shop_id));
create policy "patron: modifier" on public.mm_ops for update using (private.is_patron(shop_id)) with check (private.is_patron(shop_id));
create policy "annuler: patron, ou sa ligne recente" on public.mm_ops for delete
  using (private.is_patron(shop_id) or (created_by = (select auth.uid()) and created_at > now() - interval '10 minutes'));

drop trigger if exists mm_ops_author on public.mm_ops;
create trigger mm_ops_author before insert on public.mm_ops for each row execute function private.stamp_author();
