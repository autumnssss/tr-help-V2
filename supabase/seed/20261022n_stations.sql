-- Kitchen 2026-10-22: every menu item needs a station. Re-runnable.
-- * Honey Glazed Carrots: sauté. Corn Niblets: boiled.
-- * Everything boiled goes under Boil → Salted water; Chef B decides the order (debris and color carry-over
--   between items: potatoes only with potatoes, green beans before broccoli, cauliflower not after greens).
-- * Rice keeps its own pot (kitchen 2026-10-15), basmati and cilantro lime rice included.
update public.kitchen_recipes r set method = v.m, prep_group = v.g
from public.kitchens k, (values
  ('Honey Glazed Carrots', 'saute', null::text),
  ('Corn Niblets',         'boil',  'Salted water'),
  ('Cavatappi',            'boil',  'Salted water'),
  ('Orzo',                 'boil',  'Salted water'),
  ('Spaghetti',            'boil',  'Salted water'),
  ('Basmati Rice',         'boil',  'Rice'),
  ('Cilantro Lime Rice',   'boil',  'Rice')
) v(name, m, g)
where k.id = r.kitchen_id and k.name = 'TR Help' and r.name = v.name;
