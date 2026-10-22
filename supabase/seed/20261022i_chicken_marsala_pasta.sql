-- Chicken Marsala Pasta with Broccoli + sweet potato container (kitchen 2026-10-22). Re-runnable; no deletes.
-- Chicken Marsala from the recipe card (ingredients only; steps are a standard method to confirm).
-- Chicken broth = Chicken Broth (Better Than Bouillon). Pasta = cavatappi, cooked per package;
-- dry → cooked weight gain ×2 (same estimate as the other pastas).
-- Plate 4/4/4: Chicken Marsala (with sauce), cavatappi, broccoli. 6 oz = 6 oz chicken marsala.
-- Family 16/16/16, 3 labels, 3 × 28 oz plates (kitchen default rule).
-- Baked Sweet Potato with Brie goes in a 24 oz deep (short) container.
-- Line weights computed here in SQL: amount × grams per unit (estimates) ÷ 28.3495 → oz.

with k as (select id from public.kitchens where name = 'TR Help')
insert into public.ingredients (kitchen_id, name, yield, yield_source, category, staple)
select k.id, v.name, v.y, 'estimate', v.cat, false
from k, (values
  ('Cremini mushrooms, sliced', 0.6::numeric, 'Produce'),       -- sauté water loss, estimate
  ('Marsala wine, dry',         0.5,          'Beverages'),     -- reduced in the pan, estimate
  ('Cavatappi',                 2,            'Canned & Dry')   -- dry → cooked, estimate
) v(name, y, cat)
where not exists (select 1 from public.ingredients i where i.kitchen_id = k.id and lower(i.name) = lower(v.name));

with k as (select id from public.kitchens where name = 'TR Help')
insert into public.kitchen_recipes (kitchen_id, name, method, notes, steps)
select k.id, v.name, v.m, v.notes, v.steps from k, (values
  ('Chicken Marsala', 'saute', 'Recipe card lists ingredients only; steps are a standard method — confirm.',
   E'1. Season cutlets with salt and pepper; dredge in flour, shake off excess.\n2. Brown in olive oil, both sides, until cooked through. Remove.\n3. Sauté mushrooms until browned.\n4. Add Marsala, scrape up the browned bits, and reduce by about half. Add broth and simmer a few minutes.\n5. Off the heat, swirl in the cold butter. Return the chicken to the sauce.'),
  ('Cavatappi', 'boil', 'Plate: 4 oz cooked.',
   E'1. Cook per package directions, including water and salt.\n2. Toss with a little oil and cool spread out before packing.')
) v(name, m, notes, steps)
where not exists (select 1 from public.kitchen_recipes r where r.kitchen_id = k.id and r.name = v.name);

with k as (select id from public.kitchens where name = 'TR Help')
insert into public.recipe_lines (kitchen_id, recipe_id, position, amount, unit, raw_name, note, ingredient_id, oz)
select k.id, r.id, v.pos, v.amount, v.unit, v.line, v.note, i.id, round(v.amount * v.g / 28.3495, 3)
from k, (values
  ('Chicken Marsala', 1, 4::numeric, '',     'boneless skinless chicken breast cutlets, 5 oz each', 'Chicken breast, boneless skinless', 5 * 28.3495::numeric, '5 oz each'),
  ('Chicken Marsala', 2, 1,          'tsp',  'kosher salt',                     'Kosher salt',               3,     'estimate'),
  ('Chicken Marsala', 3, 0.5,        'tsp',  'black pepper',                    'Black pepper',              2.3,   'estimate'),
  ('Chicken Marsala', 4, 0.5,        'cup',  'all-purpose flour (dredge)',      'All-purpose flour',         125,   'estimate'),
  ('Chicken Marsala', 5, 2,          'tbsp', 'olive oil',                       'Olive oil',                 13.5,  'estimate'),
  ('Chicken Marsala', 6, 8,          'oz',   'cremini mushrooms, sliced',       'Cremini mushrooms, sliced', 28.3495, ''),
  ('Chicken Marsala', 7, 0.75,       'cup',  'dry Marsala wine',                'Marsala wine, dry',         236.6, 'estimate'),
  ('Chicken Marsala', 9, 3,          'tbsp', 'cold unsalted butter',            'Butter',                    14.2,  'estimate'),
  ('Cavatappi',       1, 1,          'lb',   'cavatappi, dry',                  'Cavatappi',                 453.592, 'dry → cooked ×2, estimate')
) v(recipe, pos, amount, unit, line, ingredient, g, note)
join public.kitchen_recipes r on r.kitchen_id = (select id from k) and r.name = v.recipe
join public.ingredients i on i.kitchen_id = (select id from k) and lower(i.name) = lower(v.ingredient)
where not exists (select 1 from public.recipe_lines l where l.recipe_id = r.id and l.position = v.pos);

-- ½ cup chicken broth → Chicken Broth; weight = cups × one broth batch.
with k as (select id from public.kitchens where name = 'TR Help'),
  dish as (select r.id from public.kitchen_recipes r, k where r.kitchen_id = k.id and r.name = 'Chicken Marsala'),
  broth as (select r.id from public.kitchen_recipes r, k where r.kitchen_id = k.id and r.name = 'Chicken Broth')
insert into public.recipe_lines (kitchen_id, recipe_id, position, amount, unit, raw_name, note, sub_recipe_id, oz)
select (select id from k), dish.id, 8, 0.5, 'cup', 'chicken broth', 'kitchen ok', broth.id,
  0.5 * (select sum(b.oz) from public.recipe_lines b where b.recipe_id = broth.id)
from dish, broth
where not exists (select 1 from public.recipe_lines l where l.recipe_id = dish.id and l.position = 8);

-- Menu item
with k as (select id from public.kitchens where name = 'TR Help')
insert into public.menu_items (kitchen_id, name, kind)
select k.id, 'Chicken Marsala Pasta with Broccoli', 'meal' from k
where not exists (select 1 from public.menu_items m where m.kitchen_id = k.id and m.name = 'Chicken Marsala Pasta with Broccoli');

with k as (select id from public.kitchens where name = 'TR Help')
insert into public.menu_sizes (kitchen_id, menu_item_id, variation, labels)
select (select id from k), m.id, v.variation, v.labels
from public.menu_items m, (values ('regular', 1), ('6 oz', 1), ('family', 3)) v(variation, labels)
where m.kitchen_id = (select id from k) and m.name = 'Chicken Marsala Pasta with Broccoli'
  and not exists (select 1 from public.menu_sizes s where s.menu_item_id = m.id and s.variation = v.variation);

with k as (select id from public.kitchens where name = 'TR Help')
insert into public.size_portions (kitchen_id, size_id, recipe_id, oz)
select (select id from k), s.id, r.id, v.oz
from (values
  ('regular', 'Chicken Marsala', 4::numeric), ('regular', 'Cavatappi', 4), ('regular', 'Broccoli', 4),
  ('6 oz',    'Chicken Marsala', 6),          ('6 oz',    'Cavatappi', 4), ('6 oz',    'Broccoli', 4),
  ('family',  'Chicken Marsala', 16),         ('family',  'Cavatappi', 16), ('family', 'Broccoli', 16)
) v(variation, recipe, oz)
join public.menu_items m on m.kitchen_id = (select id from k) and m.name = 'Chicken Marsala Pasta with Broccoli'
join public.menu_sizes s on s.menu_item_id = m.id and s.variation = v.variation
join public.kitchen_recipes r on r.kitchen_id = (select id from k) and r.name = v.recipe
where not exists (select 1 from public.size_portions p where p.size_id = s.id and p.recipe_id = r.id);

-- Packaging: Marsala plate on 28 oz plates; sweet potato in a 24 oz deep container.
with k as (select id from public.kitchens where name = 'TR Help')
insert into public.size_packaging (kitchen_id, size_id, container_id, qty)
select (select id from k), s.id, c.id, case when s.variation = 'family' then 3 else 1 end
from public.menu_sizes s
join public.menu_items m on m.id = s.menu_item_id
join (values ('Chicken Marsala Pasta with Broccoli', '28 oz plate (single compartment)'),
             ('Baked Sweet Potato with Brie',        '24 oz deep')) v(item, container) on v.item = m.name
join public.container_types c on c.kitchen_id = (select id from k) and c.name = v.container
where m.kitchen_id = (select id from k)
  and not exists (select 1 from public.size_packaging p where p.size_id = s.id and p.container_id = c.id);
