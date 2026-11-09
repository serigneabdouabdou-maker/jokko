-- Crédit Gemini vide : la fabrique se met en pause (plus d'essais inutiles) et reprend seule au premier appel réussi.
-- Les modèles refusés pour « crédit vide » reviennent dans la file au lieu d'être perdus.
create or replace function public.studio_done(p_id uuid, p_model uuid, p_error text)
returns void language sql security definer set search_path = '' as $$
  update public.studio_queue set
    status = case when p_model is not null then 'fait' when p_error like 'Gemini 402%' then 'attente' else 'erreur' end,
    model_id = p_model, error = left(p_error, 300),
    done_at = case when p_model is null and p_error like 'Gemini 402%' then null else now() end,
    started_at = case when p_model is null and p_error like 'Gemini 402%' then null else started_at end
  where id = p_id;
$$;

create or replace function private.studio_tick()
returns void language plpgsql security definer set search_path = '' as $$
declare per int := coalesce((select value::int from private.app_config where key = 'images_par_minute'), 2);
declare last_402 timestamptz := (select max(at) from public.gemini_calls where status = 402);
declare last_ok timestamptz := (select max(at) from public.gemini_calls where ok);
begin
  if not exists (select 1 from public.studio_queue where status = 'attente') then return; end if;
  -- Pause : un refus « crédit vide » récent et aucun appel réussi depuis (on réessaie un seul modèle toutes les 10 minutes).
  if last_402 is not null and (last_ok is null or last_ok < last_402) then
    if last_402 > now() - interval '10 minutes' then return; end if;
    per := 1;
  end if;
  for i in 1..least(per, 6) loop
    perform net.http_post(
      url := 'https://solocpbqtqlxdfpjiewm.supabase.co/functions/v1/galerie',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := jsonb_build_object('token', (select value from private.app_config where key = 'galerie_token'), 'action', 'suivant'),
      timeout_milliseconds := 120000);
  end loop;
end $$;

-- Chaque ligne de la file dit si on fabrique aussi les vues profil et dos (nouvelles commandes : oui).
alter table public.studio_queue add column if not exists vues boolean not null default true;
