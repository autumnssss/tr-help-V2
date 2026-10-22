-- Kitchen 2026-10-22. Re-runnable; no deletes.
-- * Container sizes: the shopping list rounds these up to whole containers. One size per item; where the
--   kitchen buys several sizes, the default below is the one the recipes use most (change any time).
--   Volume containers are converted to weight here in SQL (mL or cups × grams, estimates).
-- * Rice: each kind cooks and cools on its own (no shared pot), so rice recipes aren't grouped.
-- * Baking sweet potatoes are bought by count (~8 oz each), separate from cubing sweet potatoes (by weight).

update public.ingredients i set purchase_unit = v.unit, purchase_oz = round(v.oz, 3)
from public.kitchens k, (values
  ('Marsala wine, dry',     'bottles (750 mL)',    750 / 28.3495::numeric),   -- ~1 g per mL
  ('Cranberry sauce',       'cans (14 oz)',        14),
  ('Tomato paste',          'cans (6 oz)',         6),
  ('Tomato sauce, canned',  'cans (15 oz)',        15),
  ('Cavatappi',             'boxes (16 oz)',       16),
  ('Black beans, dry',      'bags (16 oz)',        16),
  ('Brie',                  'wheels (8 oz)',       8),
  ('Pecans, chopped',       'bags (8 oz)',         8),
  ('Sour cream',            'tubs (16 oz)',        16),
  ('Cotija cheese',         'packages (8 oz)',     8),
  ('Heavy cream',           'quarts',              4 * 238 / 28.3495),         -- 238 g per cup, estimate
  ('Whole milk',            'gallons',             16 * 244 / 28.3495)         -- 244 g per cup, estimate
) v(name, unit, oz)
where k.id = i.kitchen_id and k.name = 'TR Help' and i.name = v.name;

update public.kitchen_recipes r set prep_group = null
from public.kitchens k
where k.id = r.kitchen_id and k.name = 'TR Help' and r.name in ('Cooked Rice', 'Basmati Rice', 'Cilantro Lime Rice');

with k as (select id from public.kitchens where name = 'TR Help')
insert into public.ingredients (kitchen_id, name, yield, yield_source, category, staple, purchase_unit, purchase_oz)
select k.id, 'Sweet potatoes, baking (~8 oz each)', 1, 'kitchen', 'Produce', false, 'potatoes', 8 from k
where not exists (select 1 from public.ingredients i where i.kitchen_id = k.id and i.name = 'Sweet potatoes, baking (~8 oz each)');

update public.recipe_lines l set ingredient_id = i.id, raw_name = 'sweet potato, baking size (~8 oz)'
from public.kitchen_recipes r, public.ingredients i, public.kitchens k
where l.recipe_id = r.id and r.kitchen_id = k.id and k.name = 'TR Help' and r.name = 'Baked Sweet Potato with Brie'
  and l.position = 1 and i.kitchen_id = k.id and i.name = 'Sweet potatoes, baking (~8 oz each)';
