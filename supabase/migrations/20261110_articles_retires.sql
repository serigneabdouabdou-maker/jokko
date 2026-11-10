-- Jokko — Articles retirés du panier avant encaissement, 10 novembre 2026.
-- Fraude de caisse la plus courante : scanner devant le client, retirer l'article, garder l'argent.
-- Chaque retrait est noté (qui, quoi, combien) et sort sur le ticket Z. Une ligne ne se modifie
-- jamais et personne ne peut l'effacer (même pas le patron) : c'est la preuve.

create table if not exists public.cart_voids (
  id text primary key,
  shop_id text not null references public.shops(id) on delete cascade,
  at timestamptz not null default now(),
  product_id text not null default '',
  label text not null default '',
  qty numeric not null default 0 check (qty >= 0),
  amount bigint not null default 0 check (amount >= 0),
  by_name text not null default '',
  place text not null default 'scanner' check (place in ('scanner', 'cuisine')),
  created_by uuid default auth.uid()
);
create index if not exists cart_voids_shop_at on public.cart_voids (shop_id, at desc);

alter table public.cart_voids enable row level security;
drop policy if exists "membre: lire" on public.cart_voids;
drop policy if exists "membre: ajouter" on public.cart_voids;
drop policy if exists "membre: modifier" on public.cart_voids;
create policy "membre: lire" on public.cart_voids for select using (private.is_member(shop_id));
create policy "membre: ajouter" on public.cart_voids for insert with check (private.is_member(shop_id));
-- La synchro envoie en « upsert » : on l'autorise, mais le déclencheur garde toujours l'ancienne ligne.
create policy "membre: modifier" on public.cart_voids for update using (private.is_member(shop_id)) with check (private.is_member(shop_id));

-- Le vrai auteur est le compte connecté, pas le nom envoyé par le téléphone.
create or replace function private.cart_voids_freeze()
returns trigger language plpgsql set search_path to '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    return new;
  end if;
  return old;
end $$;
drop trigger if exists cart_voids_freeze on public.cart_voids;
create trigger cart_voids_freeze before insert or update on public.cart_voids for each row execute function private.cart_voids_freeze();

-- Chaque soir à 20 h 31 (heure de Dakar) : le patron est prévenu si un vendeur a retiré beaucoup plus
-- d'articles que d'habitude (au moins 5 aujourd'hui ET plus de 3 fois sa moyenne des 14 jours d'avant).
-- Les retraits du patron lui-même ne déclenchent rien. Une seule notification par boutique.
create or replace function private.voids_watch()
returns integer language plpgsql security definer set search_path to '' as $$
declare r record; v_sent integer := 0;
begin
  for r in
    with v as (
      select c.shop_id, c.created_by, max(c.by_name) as name,
             sum(case when c.qty = trunc(c.qty) then c.qty else 1 end) filter (where (c.at at time zone 'Africa/Dakar')::date = (now() at time zone 'Africa/Dakar')::date) as today,
             sum(c.amount) filter (where (c.at at time zone 'Africa/Dakar')::date = (now() at time zone 'Africa/Dakar')::date) as today_amount,
             coalesce(sum(case when c.qty = trunc(c.qty) then c.qty else 1 end) filter (where (c.at at time zone 'Africa/Dakar')::date < (now() at time zone 'Africa/Dakar')::date), 0) / 14.0 as avg_day
      from public.cart_voids c
      where c.at >= now() - interval '15 days' and c.created_by is not null
      group by c.shop_id, c.created_by
    )
    select v.shop_id,
           string_agg(coalesce(nullif(v.name, ''), 'un vendeur') || ' : ' || v.today::int || ' articles (' || replace(to_char(v.today_amount, 'FM999G999G999'), ',', ' ') || ' F)', ', ' order by v.today desc) as who
    from v
    where v.today >= 5 and v.today > 3 * v.avg_day
      and not exists (select 1 from public.shop_members m where m.shop_id = v.shop_id and m.user_id = v.created_by and m.role = 'patron')
    group by v.shop_id
  loop
    perform private.call_notify(jsonb_build_object('kind', 'boutique', 'shop', r.shop_id, 'tag', 'retraits-' || to_char(now() at time zone 'Africa/Dakar', 'YYYYMMDD'),
      'title', 'Beaucoup d''articles retirés aujourd''hui',
      'body', r.who || '. C''est plus que d''habitude : regarde le ticket Z dans Caisse et compare avec l''argent.'));
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end $$;
revoke all on function private.voids_watch() from public;

select cron.unschedule('jokko-retraits-soir') where exists (select 1 from cron.job where jobname = 'jokko-retraits-soir');
select cron.schedule('jokko-retraits-soir', '31 20 * * *', 'select private.voids_watch()');
