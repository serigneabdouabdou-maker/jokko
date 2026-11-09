-- Forfaits rentables (09/11/2026, demande de Fallou) : un essai court qui montre la valeur, un gratuit très réduit,
-- et un compteur visible pour que le commerçant voie ce qu'il lui reste.

-- Essai (14 jours) : une vraie découverte, mais une enveloppe totale ≈ 210 F au plus par boutique.
insert into private.app_config (key, value) values
  ('essai_total_echange', '8'),   -- une vraie conversation en direct (≈ 61 F)
  ('essai_total_vocal', '10'),    -- ≈ 25 F
  ('essai_total_texte', '20'),    -- ≈ 20 F
  ('essai_total_conseil', '2'),   -- ≈ 6 F
  ('essai_total_image', '1'),     -- 1 essayage (≈ 25 F)
  ('essai_total_stock', '5'),     -- avant : 20 par jour pendant 14 jours, sans limite totale
  ('essai_total_voix', '60'),     -- avant : 100 par jour pendant 14 jours, sans limite totale
  -- Gratuit (après l'essai) : de quoi rester attaché à Jokko, pas de quoi s'en passer de payer. ≈ 70 F par mois au plus.
  ('gratuit_mois_vocal', '10'), ('gratuit_mois_texte', '20'), ('gratuit_mois_voix', '20'), ('gratuit_mois_stock', '2'),
  ('quota_gratuit_vocal', '3'), ('quota_gratuit_texte', '5'), ('quota_gratuit_voix', '10'), ('quota_gratuit_stock', '1'),
  ('plafond_gratuit_jour', '300')
on conflict (key) do update set value = excluded.value;

-- Trou bouché : la lecture de stock et la voix claire de l'essai comptent maintenant dans l'enveloppe totale.
do $$
declare d text := pg_get_functiondef('public.use_assistant(text,text)'::regprocedure);
begin
  if position('p_kind not in (''stock'', ''voix'')' in d) = 0 then raise exception 'use_assistant a changé : vérifier à la main'; end if;
  d := replace(d, 'if t = ''essai'' and p_kind not in (''stock'', ''voix'') then', 'if t = ''essai'' then');
  execute d;
end $$;

-- Ce qu'il reste au commerçant (essai : au total ; gratuit : ce mois). null pour une offre payante.
create or replace function public.forfait_reste(p_shop text)
returns json language plpgsql stable security definer set search_path = '' as $$
declare t text;
declare month_start date := date_trunc('month', (now() at time zone 'Africa/Dakar')::date)::date;
begin
  if not private.is_member(p_shop) then raise exception 'boutique inconnue'; end if;
  if private.quota_free() then return null; end if;
  t := coalesce(private.assistant_tier(p_shop), 'gratuit');
  if t = 'essai' then
    return json_build_object('offre', t, 'reste', (select json_object_agg(k, json_build_object(
      'total', private.trial_total(k),
      'reste', greatest(0, private.trial_total(k) - coalesce((select sum(n) from public.assistant_usage u where u.shop_id = p_shop and u.kind = k), 0))))
      from unnest(array['echange', 'vocal', 'texte', 'image']) as k));
  end if;
  if t = 'gratuit' then
    return json_build_object('offre', t, 'reste', (select json_object_agg(k, json_build_object(
      'total', private.gratuit_mois(k),
      'reste', greatest(0, private.gratuit_mois(k) - coalesce((select sum(n) from public.assistant_usage u where u.shop_id = p_shop and u.kind = k and u.day >= month_start), 0))))
      from unnest(array['vocal', 'texte']) as k));
  end if;
  return null;
end $$;
revoke all on function public.forfait_reste(text) from public, anon;
grant execute on function public.forfait_reste(text) to authenticated;
