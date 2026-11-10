-- Catalogue des plats, jus et pains (10/11/2026) : une photo par minute (une seule demande à la fois : WORKER_RESOURCE_LIMIT sinon).
create table if not exists private.catalogue_queue (id text primary key, prompt text not null, status text not null default 'attente', req bigint, at timestamptz, essais int not null default 0);
insert into private.catalogue_queue (id, prompt) values
('ceebu-jen', 'Senegalese dish served on a beautiful ceramic plate, thieboudienne: red broken rice with a whole stuffed fish, cassava, carrot, cabbage, eggplant, pumpkin'),
('ceebu-yapp', 'Senegalese dish served on a beautiful ceramic plate, ceebu yapp: brown rice with tender braised lamb pieces, onions and peas'),
('yassa-poulet', 'Senegalese dish served on a beautiful ceramic plate, chicken yassa: grilled chicken with golden caramelized onion and lemon sauce, olives, white rice'),
('yassa-poisson', 'Senegalese dish served on a beautiful ceramic plate, fish yassa: grilled fish with lemon onion sauce and white rice'),
('mafe', 'Senegalese dish served on a beautiful ceramic plate, mafe: rich peanut sauce stew with beef, carrots and potatoes, served with white rice'),
('domoda', 'Senegalese dish served on a beautiful ceramic plate, domoda: red tomato and peanut stew with meat and pumpkin, white rice'),
('thiou', 'Senegalese dish served on a beautiful ceramic plate, thiou: fish in a red tomato sauce with vegetables and white rice'),
('soupou-kandja', 'Senegalese dish served on a beautiful ceramic plate, soupou kandja: okra and palm oil sauce with fish and seafood, white rice'),
('caldou', 'Senegalese dish served on a beautiful ceramic plate, caldou: fish in a light lemon and onion broth with white rice'),
('dibi', 'Senegalese dibi: grilled lamb pieces on brown paper with sliced onions, mustard and chili, '),
('dibi-hausa', 'Senegalese dibi hausa: spicy beef skewers with kankankan spice, sliced onions, '),
('poulet-braise', 'Senegalese dish served on a beautiful ceramic plate, braised grilled chicken with attieke or fries, onion sauce and salad'),
('poisson-braise', 'Senegalese dish served on a beautiful ceramic plate, whole grilled fish with attieke, onions, tomato and chili'),
('attieke-poisson', 'Senegalese dish served on a beautiful ceramic plate, attieke cassava couscous with fried fish, onion, tomato and chili sauce'),
('lakh', 'Senegalese lakh: millet porridge with sweet curd (soow) in a bowl, '),
('thiakry', 'Senegalese thiakry: millet couscous dessert with sweet creamy yogurt, raisins, in a glass bowl, '),
('ndambe', 'Senegalese ndambe sandwich: baguette filled with spicy black-eyed pea stew, '),
('sandwich-viande', 'Senegalese street sandwich: baguette with grilled meat, onions, fries and sauce, '),
('chawarma', 'Dakar chicken shawarma wrap with fries and garlic sauce, '),
('fataya', 'Senegalese fataya: golden fried meat turnovers with spicy tomato onion sauce, '),
('pastels', 'Senegalese pastels: small fried fish turnovers with spicy sauce, '),
('bissap', 'Senegalese homemade juice in a clear glass bottle and a tall glass with ice, deep red hibiscus bissap juice with mint leaves and dried hibiscus flowers'),
('bouye', 'Senegalese homemade juice in a clear glass bottle and a tall glass with ice, creamy white baobab fruit bouye juice with baobab pods'),
('gingembre', 'Senegalese homemade juice in a clear glass bottle and a tall glass with ice, pale yellow fresh ginger juice with ginger root and lemon'),
('ditax', 'Senegalese homemade juice in a clear glass bottle and a tall glass with ice, green ditax (detarium) fruit juice with the green ditax fruits'),
('tamarin', 'Senegalese homemade juice in a clear glass bottle and a tall glass with ice, brown tamarind juice with tamarind pods'),
('jus-mangue', 'Senegalese homemade juice in a clear glass bottle and a tall glass with ice, thick orange mango juice with fresh mango slices'),
('cafe-touba', 'Senegalese café Touba: spiced coffee with grains of selim served in a small glass, steam, '),
('ataya', 'Senegalese ataya green mint tea with foam in small glasses and a teapot, '),
('baguette', 'Fresh bakery product, golden crusty French baguettes in a wicker basket'),
('tapalapa', 'Fresh bakery product, Senegalese tapalapa bread, dense rustic short loaves'),
('pain-mie', 'Fresh bakery product, soft sliced white sandwich bread loaf'),
('croissant', 'Fresh bakery product, golden flaky butter croissants'),
('pain-chocolat', 'Fresh bakery product, golden pain au chocolat pastries'),
('beignets', 'Fresh bakery product, round golden sugar-dusted beignets (fried dough balls)'),
('cake', 'Fresh bakery product, sliced golden pound cake')

on conflict (id) do nothing;

create or replace function private.catalogue_tick()
returns void language plpgsql security definer set search_path = '' as $$
declare j record;
begin
  -- une demande « envoyée » sans réponse réussie après 4 minutes revient en attente (3 essais au plus)
  update private.catalogue_queue q set status = 'attente'
  where q.status = 'envoye' and q.at < now() - interval '4 minutes' and q.essais < 3
    and not exists (select 1 from net._http_response r where r.id = q.req and r.status_code = 200);
  select * into j from private.catalogue_queue where status = 'attente' order by id limit 1;
  if j.id is null then
    if not exists (select 1 from private.catalogue_queue where status = 'envoye' and at > now() - interval '4 minutes') then
      perform cron.unschedule('jokko-catalogue-plats');
    end if;
    return;
  end if;
  update private.catalogue_queue set status = 'envoye', at = now(), essais = essais + 1, req = net.http_post(
    url := 'https://solocpbqtqlxdfpjiewm.supabase.co/functions/v1/accueil',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object('token', (select value from private.app_config where key = 'galerie_token'), 'action', 'plat', 'id', j.id, 'prompt', j.prompt),
    timeout_milliseconds := 120000)
  where id = j.id;
end $$;

select cron.schedule('jokko-catalogue-plats', '* * * * *', 'select private.catalogue_tick()');
