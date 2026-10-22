-- Fajita Combo Bowl Beef & Chicken (kitchen 2026-10-22). Re-runnable; no deletes.
-- Plate: 4 oz cilantro lime rice, 4 oz black beans, 2 oz flank steak, 2 oz chicken, 1.5 oz peppers & onions
-- (garnish: not counted in the plate weight, but bought and costed to this dish). 6 oz = 3 + 3 protein.
-- Family 16/16/8/8/6, 3 labels. 24 oz divided plate.
-- Cilantro lime rice: per 1 lb dry rice, 1.5 tbsp lime juice + ⅓ bunch cilantro. Steak/chicken: salt and pepper
-- to taste (staples). Peppers & onions: 2 parts bell pepper to 1 part red onion, by weight.
-- Weights computed here in SQL: amount × grams per unit (estimates) ÷ 28.3495 → oz.

with k as (select id from public.kitchens where name = 'TR Help')
insert into public.ingredients (kitchen_id, name, yield, yield_source, category, staple)
select k.id, 'Flank steak', 0.75, 'estimate', 'Meat & Seafood', false from k
where not exists (select 1 from public.ingredients i where i.kitchen_id = k.id and i.name = 'Flank steak');

-- Cilantro is bought by the bunch (~80 g, estimate).
update public.ingredients i set purchase_unit = 'bunches', purchase_oz = round(80 / 28.3495, 3)
from public.kitchens k where k.id = i.kitchen_id and k.name = 'TR Help' and i.name = 'Cilantro' and i.purchase_unit is null;

with k as (select id from public.kitchens where name = 'TR Help')
insert into public.kitchen_recipes (kitchen_id, name, method, notes, steps)
select k.id, v.name, v.m, v.notes, v.steps from k, (values
  ('Cilantro Lime Rice', 'boil', 'Plate: 4 oz.',
   E'1. Cook the rice per package directions, including water and salt.\n2. Toss with lime juice and chopped cilantro.'),
  ('Grilled Flank Steak', 'grill', 'Plate: 2 oz (fajita bowl). Seasoning: salt and pepper to taste, for now.',
   E'1. Season with salt and pepper.\n2. Grill to temperature. Rest, then slice thin against the grain.'),
  ('Grilled Chicken Breast', 'grill', 'Plate: 2 oz (fajita bowl). Seasoning: salt and pepper to taste, for now.',
   E'1. Season with salt and pepper.\n2. Grill to 165°F internal. Rest, then slice.'),
  ('Fajita Peppers & Onions', 'saute', 'Garnish: 1.5 oz per plate, not counted in the plate weight. 2 parts peppers to 1 part red onion.',
   E'1. Slice bell peppers and red onion into strips.\n2. Sauté until tender with some char.')
) v(name, m, notes, steps)
where not exists (select 1 from public.kitchen_recipes r where r.kitchen_id = k.id and r.name = v.name);

with k as (select id from public.kitchens where name = 'TR Help')
insert into public.recipe_lines (kitchen_id, recipe_id, position, amount, unit, raw_name, note, ingredient_id, oz)
select k.id, r.id, v.pos, v.amount, v.unit, v.line, v.note, i.id, round(v.amount * v.g / 28.3495, 3)
from k, (values
  ('Cilantro Lime Rice',      2, 1.5::numeric, 'tbsp',    'lime juice',             'Lime juice',   15.4::numeric, 'estimate'),
  ('Cilantro Lime Rice',      3, 0.33,         'bunch',   'cilantro, chopped',      'Cilantro',     80,            '~80 g bunch, estimate'),
  ('Grilled Flank Steak',     1, 1,            'lb',      'flank steak',            'Flank steak',  453.592,       'cook loss 25%, estimate'),
  ('Grilled Chicken Breast',  1, 1,            'lb',      'chicken breast, boneless skinless', 'Chicken breast, boneless skinless', 453.592, ''),
  ('Fajita Peppers & Onions', 1, 2,            'lb',      'bell peppers',           'Bell peppers', 453.592,       '2 parts'),
  ('Fajita Peppers & Onions', 2, 1,            'lb',      'red onion',              'Red onion',    453.592,       '1 part')
) v(recipe, pos, amount, unit, line, ingredient, g, note)
join public.kitchen_recipes r on r.kitchen_id = (select id from k) and r.name = v.recipe
join public.ingredients i on i.kitchen_id = (select id from k) and i.name = v.ingredient
where not exists (select 1 from public.recipe_lines l where l.recipe_id = r.id and l.position = v.pos);

-- 1 lb dry rice → Cooked Rice; weight = one Cooked Rice batch (cooked), so both cards agree.
with k as (select id from public.kitchens where name = 'TR Help'),
  dish as (select r.id from public.kitchen_recipes r, k where r.kitchen_id = k.id and r.name = 'Cilantro Lime Rice'),
  rice as (select r.id from public.kitchen_recipes r, k where r.kitchen_id = k.id and r.name = 'Cooked Rice')
insert into public.recipe_lines (kitchen_id, recipe_id, position, amount, unit, raw_name, note, sub_recipe_id, oz)
select (select id from k), dish.id, 1, 1, 'lb dry', 'long-grain rice, cooked', 'kitchen ok', rice.id,
  (select sum(l.oz * i.yield) from public.recipe_lines l join public.ingredients i on i.id = l.ingredient_id where l.recipe_id = rice.id)
from dish, rice
where not exists (select 1 from public.recipe_lines l where l.recipe_id = dish.id and l.position = 1);

-- Menu item
with k as (select id from public.kitchens where name = 'TR Help')
insert into public.menu_items (kitchen_id, name, kind)
select k.id, 'Fajita Combo Bowl Beef & Chicken', 'meal' from k
where not exists (select 1 from public.menu_items m where m.kitchen_id = k.id and m.name = 'Fajita Combo Bowl Beef & Chicken');

with k as (select id from public.kitchens where name = 'TR Help')
insert into public.menu_sizes (kitchen_id, menu_item_id, variation, labels)
select (select id from k), m.id, v.variation, v.labels
from public.menu_items m, (values ('regular', 1), ('6 oz', 1), ('family', 3)) v(variation, labels)
where m.kitchen_id = (select id from k) and m.name = 'Fajita Combo Bowl Beef & Chicken'
  and not exists (select 1 from public.menu_sizes s where s.menu_item_id = m.id and s.variation = v.variation);

with k as (select id from public.kitchens where name = 'TR Help')
insert into public.size_portions (kitchen_id, size_id, recipe_id, oz)
select (select id from k), s.id, r.id, v.oz
from (values
  ('regular', 'Cilantro Lime Rice', 4::numeric), ('regular', 'Black Beans', 4), ('regular', 'Grilled Flank Steak', 2),
  ('regular', 'Grilled Chicken Breast', 2),      ('regular', 'Fajita Peppers & Onions', 1.5),
  ('6 oz',    'Cilantro Lime Rice', 4),          ('6 oz',    'Black Beans', 4), ('6 oz',    'Grilled Flank Steak', 3),
  ('6 oz',    'Grilled Chicken Breast', 3),      ('6 oz',    'Fajita Peppers & Onions', 1.5),
  ('family',  'Cilantro Lime Rice', 16),         ('family',  'Black Beans', 16), ('family', 'Grilled Flank Steak', 8),
  ('family',  'Grilled Chicken Breast', 8),      ('family',  'Fajita Peppers & Onions', 6)
) v(variation, recipe, oz)
join public.menu_items m on m.kitchen_id = (select id from k) and m.name = 'Fajita Combo Bowl Beef & Chicken'
join public.menu_sizes s on s.menu_item_id = m.id and s.variation = v.variation
join public.kitchen_recipes r on r.kitchen_id = (select id from k) and r.name = v.recipe
where not exists (select 1 from public.size_portions p where p.size_id = s.id and p.recipe_id = r.id);

with k as (select id from public.kitchens where name = 'TR Help')
insert into public.size_packaging (kitchen_id, size_id, container_id, qty)
select (select id from k), s.id, c.id, case when s.variation = 'family' then 3 else 1 end
from public.menu_sizes s
join public.menu_items m on m.id = s.menu_item_id and m.name = 'Fajita Combo Bowl Beef & Chicken'
join public.container_types c on c.kitchen_id = m.kitchen_id and c.name = '24 oz divided'
where m.kitchen_id = (select id from k)
  and not exists (select 1 from public.size_packaging p where p.size_id = s.id and p.container_id = c.id);
