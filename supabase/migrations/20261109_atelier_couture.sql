-- Jokko — Atelier couture (tailleurs), 9 novembre 2026.
-- Commandes sur mesure (reçu → coupe → couture → finition → prêt → livré), mesures des clients,
-- et lien de suivi public pour le client (sans compte) : jokkoapp.com/?suivi=<code>.

alter table public.clients add column if not exists measures jsonb not null default '{}'::jsonb;

create table if not exists public.couture_orders (
  id text primary key,
  shop_id text not null references public.shops(id) on delete cascade,
  at timestamptz not null default now(),
  number text not null default '',
  client_id text,
  client_name text not null default '',
  phone text not null default '',
  garment text not null default '',
  fabric text not null default '',
  measures jsonb not null default '{}'::jsonb,
  price bigint not null default 0 check (price >= 0),
  paid bigint not null default 0 check (paid >= 0),
  due_at date,
  status text not null default 'recu' check (status in ('recu', 'coupe', 'couture', 'finition', 'pret', 'livre', 'annule')),
  token text not null check (length(token) >= 12),
  note text not null default '',
  ready_at timestamptz,
  delivered_at timestamptz,
  updated_at timestamptz not null default now()
);
create unique index if not exists couture_orders_token on public.couture_orders (token);
create index if not exists couture_orders_shop on public.couture_orders (shop_id);

alter table public.couture_orders enable row level security;
drop policy if exists "membre: lire" on public.couture_orders;
drop policy if exists "membre: ajouter" on public.couture_orders;
drop policy if exists "membre: modifier" on public.couture_orders;
drop policy if exists "patron: supprimer" on public.couture_orders;
create policy "membre: lire" on public.couture_orders for select using (private.is_member(shop_id));
create policy "membre: ajouter" on public.couture_orders for insert with check (private.is_member(shop_id));
create policy "membre: modifier" on public.couture_orders for update using (private.is_member(shop_id)) with check (private.is_member(shop_id));
create policy "patron: supprimer" on public.couture_orders for delete using (private.is_patron(shop_id));

drop trigger if exists couture_orders_journal on public.couture_orders;
create trigger couture_orders_journal after insert or delete or update on public.couture_orders for each row execute function private.write_journal();
drop trigger if exists couture_orders_touch on public.couture_orders;
create trigger couture_orders_touch before update on public.couture_orders for each row execute function touch_updated_at();

-- Suivi public : le client ouvre son lien et voit l'étape, la date prévue et le reste à payer. Rien d'autre.
create or replace function public.suivi_couture(p_token text)
returns json language sql stable security definer set search_path to '' as $$
  select json_build_object(
    'boutique', s.name, 'telephone', s.phone, 'numero', o.number, 'client', split_part(o.client_name, ' ', 1),
    'modele', o.garment, 'etape', o.status, 'date_prevue', o.due_at, 'reste', greatest(o.price - o.paid, 0),
    'pret_le', o.ready_at, 'livre_le', o.delivered_at, 'commande_le', o.at)
  from public.couture_orders o join public.shops s on s.id = o.shop_id
  where length(coalesce(p_token, '')) >= 12 and o.token = p_token;
$$;
revoke all on function public.suivi_couture(text) from public;
grant execute on function public.suivi_couture(text) to anon, authenticated;
