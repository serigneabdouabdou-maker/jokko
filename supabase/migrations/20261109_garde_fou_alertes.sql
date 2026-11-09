-- Alertes prédictives (toutes les 5 min avec credit_watch) : dépense prévue au-dessus du plafond, téléphones à comptes multiples.
create or replace function private.guard_watch()
returns void language plpgsql security definer set search_path = '' as $$
declare today date := (now() at time zone 'Africa/Dakar')::date;
declare hours numeric := extract(epoch from (now() at time zone 'Africa/Dakar') - today::timestamp) / 3600;
declare spent numeric := private.cout_total_jour();
declare cap numeric := coalesce((select value::numeric from private.app_config where key = 'plafond_global_jour'), 4000);
declare forecast numeric;
declare shared int;
begin
  if hours >= 6 then
    forecast := spent / hours * 24;
    if forecast >= cap and spent < cap
       and not exists (select 1 from public.admin_events where kind = 'anomalie' and meta->>'type' = 'prevision' and (at at time zone 'Africa/Dakar')::date = today) then
      perform private.admin_event('anomalie', 'Dépense prévue trop haute',
        'Au rythme actuel, Jokko dépensera environ ' || round(forecast) || ' F de Gemini aujourd''hui (plafond ' || cap || ' F). Déjà ' || round(spent) || ' F. Regarde la console, onglet Garde-fou.',
        null, '{"type":"prevision"}'::jsonb, true);
    end if;
  end if;
  select count(*) into shared from (
    select device_id from public.device_accounts group by device_id
    having count(*) > coalesce((select value::int from private.app_config where key = 'comptes_par_appareil'), 2)) x;
  if shared > 0
     and not exists (select 1 from public.admin_events where kind = 'anomalie' and meta->>'type' = 'appareils' and (at at time zone 'Africa/Dakar')::date = today) then
    perform private.admin_event('anomalie', 'Comptes multiples sur un même téléphone',
      shared || ' téléphone(s) ont servi à plus de comptes que permis : leur gratuit et leur essai sont bloqués. Détails : console, onglet Garde-fou.',
      null, '{"type":"appareils"}'::jsonb, true);
  end if;
end $$;

-- credit_watch appelle guard_watch à la fin
do $$
declare d text := pg_get_functiondef('private.credit_watch()'::regprocedure);
begin
  if position('guard_watch' in d) > 0 then return; end if;
  d := regexp_replace(d, 'end \$function\$\s*$', E'  perform private.guard_watch();\nend $function$');
  if position('guard_watch' in d) = 0 then raise exception 'credit_watch : texte inattendu'; end if;
  execute d;
end $$;
