-- Elote (Mexican Street Corn), kitchen recipe card, 2026-10-22. Re-runnable; no deletes.
-- The card has ingredients only; the steps are a standard method to confirm.
-- Corn: one 15.25 oz can; drained weight ~11 oz (estimate), so its yield = 11 ÷ 15.25.
-- Line weights computed here in SQL: amount × grams per unit (estimates) ÷ 28.3495, ÷ yield for trimmed measures.

with k as (select id from public.kitchens where name = 'TR Help')
insert into public.ingredients (kitchen_id, name, yield, yield_source, category, staple, purchase_unit, purchase_oz)
select k.id, v.name, v.y, 'estimate', v.cat, v.stap, v.unit, v.unit_oz
from k, (values
  ('Corn, canned (15.25 oz)', 11 / 15.25::numeric, 'Canned & Dry',        false, 'cans'::text, 15.25::numeric),
  ('Sour cream',              1,                   'Dairy & Eggs',        false, null, null),
  ('Cotija cheese',           1,                   'Dairy & Eggs',        false, null, null),
  ('Crushed red pepper',      1,                   'Canned & Dry',        true,  null, null),
  ('Lime juice',              1,                   'Produce',             false, null, null),
  ('Tajín',                   1,                   'Canned & Dry',        true,  null, null)
) v(name, y, cat, stap, unit, unit_oz)
where not exists (select 1 from public.ingredients i where i.kitchen_id = k.id and lower(i.name) = lower(v.name));

with k as (select id from public.kitchens where name = 'TR Help')
insert into public.kitchen_recipes (kitchen_id, name, method, notes, steps)
select k.id, 'Elote', 'saute', 'Steps are a standard method (the card lists ingredients only) — confirm.',
  E'1. Drain the corn well.\n2. Cook the corn in butter over medium-high until lightly charred.\n3. Off the heat, stir in mayonnaise, sour cream, lime juice, Tajín and crushed red pepper.\n4. Fold in cotija and cilantro.'
from k
where not exists (select 1 from public.kitchen_recipes r where r.kitchen_id = k.id and r.name = 'Elote');

with k as (select id from public.kitchens where name = 'TR Help')
insert into public.recipe_lines (kitchen_id, recipe_id, position, amount, unit, raw_name, note, ingredient_id, oz)
select k.id, r.id, v.pos, v.amount, v.unit, v.line, v.note, i.id,
  round(v.amount * v.g / 28.3495 / case when v.trimmed then i.yield else 1 end, 3)
from k, (values
  (1, 1::numeric, 'can',   'corn (15.25 oz), drained',               'Corn, canned (15.25 oz)', 15.25 * 28.3495::numeric, false, ''),
  (2, 1,          'tbsp',  'butter',                                 'Butter',                  14.2,  false, 'estimate'),
  (3, 1,          'tbsp',  'mayonnaise',                             'Mayonnaise',              13.8,  false, 'estimate'),
  (4, 1,          'tbsp',  'sour cream',                             'Sour cream',              12,    false, 'estimate'),
  (5, 0.25,       'cup',   'cotija cheese, crumbled',                'Cotija cheese',           120,   false, 'estimate'),
  (6, 1,          'pinch', 'crushed red pepper or cayenne',          'Crushed red pepper',      0.3,   false, 'estimate'),
  (7, 2,          'tbsp',  'lime juice',                             'Lime juice',              15.4,  false, 'estimate'),
  (8, 1,          'tbsp',  'Tajín',                                  'Tajín',                   7.2,   false, 'estimate'),
  (9, 4,          'tbsp',  'fresh cilantro, chopped',                'Cilantro',                1,     true,  'estimate')
) v(pos, amount, unit, line, ingredient, g, trimmed, note)
join public.kitchen_recipes r on r.kitchen_id = (select id from k) and r.name = 'Elote'
join public.ingredients i on i.kitchen_id = (select id from k) and lower(i.name) = lower(v.ingredient)
where not exists (select 1 from public.recipe_lines l where l.recipe_id = r.id and l.position = v.pos);
