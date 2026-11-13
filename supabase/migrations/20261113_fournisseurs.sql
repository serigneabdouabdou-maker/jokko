-- Fournisseurs de la boutique (nom + numéro WhatsApp) : la commande prête leur est envoyée en un toucher (demande de Fallou, 13/11/2026).
alter table public.shops add column if not exists suppliers jsonb not null default '[]'::jsonb;
