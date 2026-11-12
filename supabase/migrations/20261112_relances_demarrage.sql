-- Relances « démarrage » (12/11/2026) : sur 15 boutiques inscrites, 10 n'avaient noté aucune vente.
-- Un patron inscrit depuis plus de 24 h (et moins de 7 jours) sans aucune vente ni commande entre dans « À appeler »,
-- pour que Fallou l'appelle et lui montre Jokko en 5 minutes. Si son essai finit ensuite, la ligne passe
-- à la raison de l'essai (fini, épuisé, bientôt) et revient en haut de la liste.

alter table public.relances drop constraint if exists relances_raison_check;
alter table public.relances add constraint relances_raison_check check (raison in ('epuise', 'bientot', 'fini', 'demarrage'));

create or replace function private.trial_watch()
returns void language plpgsql security definer set search_path = '' as $function$
declare r record;
declare n int := 0;
declare total int;
declare why text;
begin
  -- 1. Essais (fini, épuisé, bientôt) : remplacent une relance « démarrage » déjà faite.
  for r in
    select s.id, s.name, s.trial_until,
      case
        when s.trial_until <= now() then 'fini'
        when coalesce((select sum(u.n) from public.assistant_usage u where u.shop_id = s.id and u.kind = 'echange'), 0) >= private.trial_total('echange')
         and coalesce((select sum(u.n) from public.assistant_usage u where u.shop_id = s.id and u.kind = 'vocal'), 0) >= private.trial_total('vocal') then 'epuise'
        when s.trial_until <= now() + interval '2 days' then 'bientot'
      end raison
    from public.shops s
    where s.deleted_at is null and s.trial_until is not null
      and s.trial_until > now() - interval '3 days'
      and not (s.plan in ('medium', 'avance') and s.plan_until > now())
      and s.owner_id not in (select user_id from private.platform_admins)
      and not exists (select 1 from public.relances x where x.shop_id = s.id and x.raison <> 'demarrage')
  loop
    continue when r.raison is null;
    insert into public.relances (shop_id, raison) values (r.id, r.raison)
      on conflict (shop_id) do update set raison = excluded.raison, created_at = now(), appele_at = null, issue = null;
    n := n + 1;
    if n <= 5 then
      select count(*) into total from public.sales where shop_id = r.id and at > now() - interval '30 days';
      why := case r.raison when 'fini' then 'Son essai est fini' when 'epuise' then 'Il a utilisé tout son essai de voix' else 'Son essai finit dans moins de 2 jours' end;
      perform private.admin_event('abonnement', 'À appeler : ' || r.name,
        why || '. Il a noté ' || total || ' vente(s) avec Jokko. Tél : ' || coalesce(private.shop_contact(r.id), '?') || '. Console, onglet « À appeler ».',
        r.id, '{"type":"relance"}'::jsonb, true);
    end if;
  end loop;

  -- 2. Démarrage : inscrit depuis plus de 24 h, aucune vente ni commande de couture.
  for r in
    select s.id, s.name
    from public.shops s
    where s.deleted_at is null
      and s.created_at < now() - interval '24 hours' and s.created_at > now() - interval '7 days'
      and s.owner_id not in (select user_id from private.platform_admins)
      and not exists (select 1 from public.relances x where x.shop_id = s.id)
      and not exists (select 1 from public.sales v where v.shop_id = s.id)
      and not exists (select 1 from public.couture_orders c where c.shop_id = s.id)
  loop
    insert into public.relances (shop_id, raison) values (r.id, 'demarrage') on conflict do nothing;
    n := n + 1;
    if n <= 5 then
      perform private.admin_event('abonnement', 'À appeler : ' || r.name,
        'Inscrit depuis plus d''un jour, aucune vente encore. Un appel de 5 minutes pour lui montrer Jokko. Tél : ' || coalesce(private.shop_contact(r.id), '?') || '. Console, onglet « À appeler ».',
        r.id, '{"type":"relance"}'::jsonb, true);
    end if;
  end loop;

  if n > 5 then
    perform private.admin_event('abonnement', (n - 5) || ' autres boutiques à appeler', 'La liste complète est dans la console, onglet « À appeler ».', null, '{"type":"relance"}'::jsonb, true);
  end if;
end $function$;
