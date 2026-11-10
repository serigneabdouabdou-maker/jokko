-- Règle de CFC (10/11/2026) : un numéro = une seule entreprise par métier. Chaque entreprise garde ses données à part (shop_id).
-- Le serveur refuse une deuxième entreprise du même métier pour le même propriétaire (création ou changement de métier).
do $$
declare d text := pg_get_functiondef('private.shop_plan_guard()'::regprocedure);
begin
  if position('une entreprise par métier' in d) > 0 then return; end if;
  d := replace(d, E'begin\n  if tg_op = ''INSERT'' then',
    E'begin\n  if (tg_op = ''INSERT'' or new.activity is distinct from old.activity) and new.deleted_at is null and exists (\n    select 1 from public.shops s where s.owner_id = new.owner_id and s.id <> new.id and s.deleted_at is null\n      and lower(trim(coalesce(s.activity, ''''))) = lower(trim(coalesce(new.activity, ''''))) and trim(coalesce(new.activity, '''')) <> ''''\n  ) then\n    raise exception ''une entreprise par métier : ce numéro a déjà une entreprise pour cette activité'';\n  end if;\n  if tg_op = ''INSERT'' then');
  if position('une entreprise par métier' in d) = 0 then raise exception 'shop_plan_guard : texte inattendu'; end if;
  execute d;
end $$;

-- Réparation : l'entreprise vide créée le 10/11 pour l'alimentation avait repris le métier couture.
update public.shops set activity = 'Alimentation générale, boutique de quartier'
where id = 'shop-297bfd96-0316-49da-83e7-089c5c90cf46' and activity = 'Couture, tailleur'
  and not exists (select 1 from public.sales where shop_id = 'shop-297bfd96-0316-49da-83e7-089c5c90cf46');
