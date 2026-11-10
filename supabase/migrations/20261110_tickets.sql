-- Tickets de caisse (10/11/2026) : numéro du ticket dans la journée, commun aux lignes d'un même encaissement.
alter table public.sales add column if not exists ticket integer;
