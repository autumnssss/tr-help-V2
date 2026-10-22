-- Baked Sweet Potato with Brie (kitchen, 2026-10-22). Re-runnable; no deletes.
-- Made by count: one recipe = 1 potato. Whole potato rubbed with oil and salt (amounts not set; staples),
-- baked until tender, topped with 2 tsp butter, 2 oz brie, 1 oz cranberry sauce, 1 oz chopped pecans.
-- The potato's size isn't set yet, so its line has no weight until it is.
-- Line weights computed here in SQL: amount × grams per unit (estimates) ÷ 28.3495 → oz.

with k as (select id from public.kitchens where name = 'TR Help')
insert into public.ingredients (kitchen_id, name, yield, yield_source, category, staple)
select k.id, v.name, 1, 'estimate', v.cat, false
from k, (values ('Brie', 'Dairy & Eggs'), ('Cranberry sauce', 'Canned & Dry'), ('Pecans, chopped', 'Canned & Dry')) v(name, cat)
where not exists (select 1 from public.ingredients i where i.kitchen_id = k.id and lower(i.name) = lower(v.name));

with k as (select id from public.kitchens where name = 'TR Help')
insert into public.kitchen_recipes (kitchen_id, name, method, notes, steps, yield_count, yield_unit)
select k.id, 'Baked Sweet Potato with Brie', 'bake', 'One per order. Potato size not set yet.',
  E'1. Rub each sweet potato with oil and salt.\n2. Bake until tender.\n3. Top each with 2 tsp butter, 2 oz brie, 1 oz cranberry sauce and 1 oz chopped pecans.',
  1, 'potato'
from k
where not exists (select 1 from public.kitchen_recipes r where r.kitchen_id = k.id and r.name = 'Baked Sweet Potato with Brie');

with k as (select id from public.kitchens where name = 'TR Help')
insert into public.recipe_lines (kitchen_id, recipe_id, position, amount, unit, raw_name, note, ingredient_id, oz)
select k.id, r.id, v.pos, v.amount, v.unit, v.line, v.note, i.id, round(v.amount * v.g / 28.3495, 3)
from k, (values
  (1, 1::numeric, 'each', 'sweet potato, whole',      'Sweet potatoes',  null::numeric, 'size not set'),
  (2, 2,          'tsp',  'butter',                   'Butter',          4.7,           'estimate'),
  (3, 2,          'oz',   'brie',                     'Brie',            28.3495,       'kitchen'),
  (4, 1,          'oz',   'cranberry sauce',          'Cranberry sauce', 28.3495,       'kitchen'),
  (5, 1,          'oz',   'pecans, chopped',          'Pecans, chopped', 28.3495,       'kitchen')
) v(pos, amount, unit, line, ingredient, g, note)
join public.kitchen_recipes r on r.kitchen_id = (select id from k) and r.name = 'Baked Sweet Potato with Brie'
join public.ingredients i on i.kitchen_id = (select id from k) and lower(i.name) = lower(v.ingredient)
where not exists (select 1 from public.recipe_lines l where l.recipe_id = r.id and l.position = v.pos);
