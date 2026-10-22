-- Carnitas (kitchen recipe, 2026-10-22). Re-runnable; no deletes.
-- The roast weight isn't known yet, so the pork line has no weight and the planner flags it until it's set.
-- Instant Pot use needs an NSF variance; if it's denied, switch to an oven braise.
-- Line weights computed here in SQL: amount × grams per unit (estimates) ÷ 28.3495 → oz.

with k as (select id from public.kitchens where name = 'TR Help')
insert into public.ingredients (kitchen_id, name, yield, yield_source, category, staple, purchase_unit, purchase_oz)
select k.id, v.name,
  coalesce(v.y, (select yield from public.ingredients where kitchen_id = k.id and name = 'Pork butt')),
  'estimate', v.cat, v.stap, v.unit, v.unit_oz
from k, (values
  ('Pork shoulder roast', null::numeric, 'Meat & Seafood', false, null::text, null::numeric),  -- cook loss same as pork butt (estimate)
  ('Beer (12 oz can)',    1,             'Beverages',      false, 'cans', 12),
  ('Ground cumin',        1,             'Canned & Dry',   true,  null, null),
  ('Chili powder',        1,             'Canned & Dry',   true,  null, null)
) v(name, y, cat, stap, unit, unit_oz)
where not exists (select 1 from public.ingredients i where i.kitchen_id = k.id and lower(i.name) = lower(v.name));

with k as (select id from public.kitchens where name = 'TR Help')
insert into public.kitchen_recipes (kitchen_id, name, method, notes, steps)
select k.id, 'Carnitas', 'braise',
  'Roast weight not set yet; spice amounts are for one roast. Instant Pot needs an NSF variance; oven braise if not approved.',
  E'1. Season the pork shoulder with cumin, chili powder, salt and pepper. Add the beer.\n2. Instant Pot 3.5 hours, slow release. Allow more time if it isn''t fall-apart tender.\n3. Remove from the pot, remove excess fat and shred the meat. Taste.\n4. Toss with olive oil, and more salt, pepper or cumin if needed.\n5. Caramelize at 425°F to crisp. Check after 5 minutes; too long in the oven dries it out.'
from k
where not exists (select 1 from public.kitchen_recipes r where r.kitchen_id = k.id and r.name = 'Carnitas');

with k as (select id from public.kitchens where name = 'TR Help')
insert into public.recipe_lines (kitchen_id, recipe_id, position, amount, unit, raw_name, note, ingredient_id, oz)
select k.id, r.id, v.pos, v.amount, v.unit, v.line, v.note, i.id, round(v.amount * v.g / 28.3495, 3)
from k, (values
  (1, null::numeric, '',     'pork shoulder roast',        'Pork shoulder roast', null::numeric, 'weight not set'),
  (2, 1,             'can',  'beer (12 oz)',               'Beer (12 oz can)',    12 * 28.3495,  'estimate: 12 fl oz ≈ 12 oz'),
  (3, 3,             'tbsp', 'ground cumin',               'Ground cumin',        6,             'estimate'),
  (4, 1,             'tbsp', 'chili powder',               'Chili powder',        8,             'estimate'),
  (5, 2,             'tsp',  'kosher salt',                'Kosher salt',         3,             'estimate'),
  (6, 2,             'tsp',  'black pepper',               'Black pepper',        2.3,           'estimate')
) v(pos, amount, unit, line, ingredient, g, note)
join public.kitchen_recipes r on r.kitchen_id = (select id from k) and r.name = 'Carnitas'
join public.ingredients i on i.kitchen_id = (select id from k) and lower(i.name) = lower(v.ingredient)
where not exists (select 1 from public.recipe_lines l where l.recipe_id = r.id and l.position = v.pos);
