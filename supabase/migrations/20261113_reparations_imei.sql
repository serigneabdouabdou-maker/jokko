alter table public.repairs add column if not exists imei text check (imei is null or imei ~ '^\d{8,17}$');
